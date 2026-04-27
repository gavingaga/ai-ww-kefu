package registry

import (
	"context"
	"sync"
	"time"
)

// Mem 进程内 Registry — 用于单测与同进程模拟集群。
//
// 多个 Hub 共享同一 Mem 实例即可演练"跨节点路由 + Pub/Sub";
// 不要在生产使用(无跨进程能力)。
type Mem struct {
	mu       sync.Mutex
	bindings map[string]binding             // sessionID → binding
	subs     map[string]map[string]chan []byte // nodeID → subID → ch
	closed   bool
	subSeq   int64
}

type binding struct {
	nodeID    string
	expiresAt time.Time
}

// NewMem 构造。
func NewMem() *Mem {
	return &Mem{
		bindings: make(map[string]binding),
		subs:     make(map[string]map[string]chan []byte),
	}
}

// Bind 实现 Registry。
func (m *Mem) Bind(_ context.Context, sessionID, nodeID string, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.bindings[sessionID] = binding{nodeID: nodeID, expiresAt: deadline(ttl)}
	return nil
}

// Refresh 实现 Registry — 同 Bind(覆盖最新 ttl)。
func (m *Mem) Refresh(ctx context.Context, sessionID, nodeID string, ttl time.Duration) error {
	return m.Bind(ctx, sessionID, nodeID, ttl)
}

// Unbind 实现 Registry。仅当当前 nodeID 匹配才删除。
func (m *Mem) Unbind(_ context.Context, sessionID, nodeID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if b, ok := m.bindings[sessionID]; ok && b.nodeID == nodeID {
		delete(m.bindings, sessionID)
	}
	return nil
}

// Lookup 实现 Registry。
func (m *Mem) Lookup(_ context.Context, sessionID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	b, ok := m.bindings[sessionID]
	if !ok {
		return "", ErrNotFound
	}
	if !b.expiresAt.IsZero() && time.Now().After(b.expiresAt) {
		delete(m.bindings, sessionID)
		return "", ErrNotFound
	}
	return b.nodeID, nil
}

// Subscribe 实现 Registry。
func (m *Mem) Subscribe(ctx context.Context, nodeID string) (<-chan []byte, error) {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return nil, ErrClosed
	}
	if m.subs[nodeID] == nil {
		m.subs[nodeID] = make(map[string]chan []byte)
	}
	m.subSeq++
	subID := keyForSub(nodeID, m.subSeq)
	ch := make(chan []byte, 64)
	m.subs[nodeID][subID] = ch
	m.mu.Unlock()

	go func() {
		<-ctx.Done()
		m.mu.Lock()
		defer m.mu.Unlock()
		if bucket, ok := m.subs[nodeID]; ok {
			if c, ok := bucket[subID]; ok {
				close(c)
				delete(bucket, subID)
			}
			if len(bucket) == 0 {
				delete(m.subs, nodeID)
			}
		}
	}()
	return ch, nil
}

// Publish 实现 Registry。
func (m *Mem) Publish(_ context.Context, nodeID string, payload []byte) error {
	m.mu.Lock()
	bucket := m.subs[nodeID]
	conns := make([]chan []byte, 0, len(bucket))
	for _, c := range bucket {
		conns = append(conns, c)
	}
	m.mu.Unlock()
	for _, c := range conns {
		select {
		case c <- payload:
		default:
			// 订阅端处理慢就丢弃,避免发布方阻塞
		}
	}
	return nil
}

// Close 实现 Registry — 关闭所有订阅。
func (m *Mem) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	for _, bucket := range m.subs {
		for _, c := range bucket {
			close(c)
		}
	}
	m.subs = nil
	return nil
}

// ErrClosed registry 已关闭。
var ErrClosed = contextErr("registry closed")

type contextErr string

func (e contextErr) Error() string { return string(e) }

func deadline(ttl time.Duration) time.Time {
	if ttl <= 0 {
		return time.Time{}
	}
	return time.Now().Add(ttl)
}

func keyForSub(nodeID string, seq int64) string {
	const digits = "0123456789"
	buf := make([]byte, 0, len(nodeID)+1+12)
	buf = append(buf, nodeID...)
	buf = append(buf, ':')
	if seq == 0 {
		buf = append(buf, '0')
	} else {
		var tmp [20]byte
		idx := len(tmp)
		for seq > 0 {
			idx--
			tmp[idx] = digits[seq%10]
			seq /= 10
		}
		buf = append(buf, tmp[idx:]...)
	}
	return string(buf)
}
