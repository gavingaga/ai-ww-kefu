// Package hub 维护本节点上的所有连接,提供按 session_id 推送能力。
//
// M1 阶段使用单进程内存表;M1 末通过 Redis 一致性 hash 实现跨节点推送
// (T-102:Redis 路由映射 + 跨节点定向推送)。
package hub

import (
	"sync"
	"sync/atomic"
)

// Conn 是连接接口,允许 hub 不依赖具体 WS 实现。
type Conn interface {
	ID() string
	SessionID() string
	UserID() string
	// Send 非阻塞投递一帧;若发送队列满则返回 false,调用方决定是否断开。
	Send(payload []byte) bool
	Close()
}

// Hub 内存连接索引。
type Hub struct {
	mu       sync.RWMutex
	bySID    map[string]map[string]Conn // session_id → conn_id → Conn
	byConnID map[string]Conn            // conn_id → Conn
	counter  atomic.Int64               // 累计连接数(用于监控)
}

// New 创建 Hub。
func New() *Hub {
	return &Hub{
		bySID:    make(map[string]map[string]Conn),
		byConnID: make(map[string]Conn),
	}
}

// Register 把连接登记到 hub。
func (h *Hub) Register(c Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.byConnID[c.ID()] = c
	if c.SessionID() != "" {
		bucket, ok := h.bySID[c.SessionID()]
		if !ok {
			bucket = make(map[string]Conn)
			h.bySID[c.SessionID()] = bucket
		}
		bucket[c.ID()] = c
	}
	h.counter.Add(1)
}

// Unregister 从 hub 删除连接。
func (h *Hub) Unregister(c Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.byConnID, c.ID())
	if c.SessionID() != "" {
		if bucket, ok := h.bySID[c.SessionID()]; ok {
			delete(bucket, c.ID())
			if len(bucket) == 0 {
				delete(h.bySID, c.SessionID())
			}
		}
	}
}

// AttachSession 把已注册的连接重新关联到一个 session_id(认证后或会话切换)。
func (h *Hub) AttachSession(c Conn, sid string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if old := c.SessionID(); old != "" {
		if bucket, ok := h.bySID[old]; ok {
			delete(bucket, c.ID())
			if len(bucket) == 0 {
				delete(h.bySID, old)
			}
		}
	}
	if sid == "" {
		return
	}
	bucket, ok := h.bySID[sid]
	if !ok {
		bucket = make(map[string]Conn)
		h.bySID[sid] = bucket
	}
	bucket[c.ID()] = c
}

// PushSession 把 payload 推到指定 session 的全部连接。
// 返回成功投递数量。
func (h *Hub) PushSession(sid string, payload []byte) int {
	h.mu.RLock()
	bucket, ok := h.bySID[sid]
	if !ok {
		h.mu.RUnlock()
		return 0
	}
	conns := make([]Conn, 0, len(bucket))
	for _, c := range bucket {
		conns = append(conns, c)
	}
	h.mu.RUnlock()

	n := 0
	for _, c := range conns {
		if c.Send(payload) {
			n++
		}
	}
	return n
}

// Broadcast 全量广播(谨慎使用;主要给系统级公告 / 测试)。
func (h *Hub) Broadcast(payload []byte) int {
	h.mu.RLock()
	conns := make([]Conn, 0, len(h.byConnID))
	for _, c := range h.byConnID {
		conns = append(conns, c)
	}
	h.mu.RUnlock()
	n := 0
	for _, c := range conns {
		if c.Send(payload) {
			n++
		}
	}
	return n
}

// Stats 给 /metrics 用。
type Stats struct {
	Connections int
	Sessions    int
	Total       int64
}

func (h *Hub) Stats() Stats {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return Stats{
		Connections: len(h.byConnID),
		Sessions:    len(h.bySID),
		Total:       h.counter.Load(),
	}
}
