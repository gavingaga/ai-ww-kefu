package dispatch

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/hub"
	"github.com/ai-kefu/gateway-ws/internal/registry"
)

// fakeConn 是 hub.Conn 的最小实现 — 与 hub_test.go 的版本独立,避免跨包依赖。
type fakeConn struct {
	id, sid string
	mu      sync.Mutex
	got     [][]byte
}

func (f *fakeConn) ID() string        { return f.id }
func (f *fakeConn) SessionID() string { return f.sid }
func (f *fakeConn) UserID() string    { return "u-" + f.id }
func (f *fakeConn) Send(p []byte) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := make([]byte, len(p))
	copy(cp, p)
	f.got = append(f.got, cp)
	return true
}
func (f *fakeConn) Close() {}
func (f *fakeConn) snapshot() [][]byte {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([][]byte, len(f.got))
	copy(out, f.got)
	return out
}

func TestDispatcherLocalHit(t *testing.T) {
	h := hub.New()
	c := &fakeConn{id: "c1", sid: "ses_1"}
	h.Register(c)

	d := New("gw-A", h, registry.NewNoop(), nil)
	n, err := d.PushSession(context.Background(), "ses_1", []byte("hi"))
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("local hit want 1 got %d", n)
	}
	if len(c.snapshot()) != 1 {
		t.Fatalf("conn should receive 1, got %d", len(c.snapshot()))
	}
}

func TestDispatcherCrossNode(t *testing.T) {
	mem := registry.NewMem()
	defer mem.Close()

	hubA := hub.New()
	hubB := hub.New()
	connA := &fakeConn{id: "ca", sid: "ses_42"}
	hubA.Register(connA)

	dA := New("gw-A", hubA, mem, nil)
	dB := New("gw-B", hubB, mem, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := dA.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer dA.Stop()
	if err := dB.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer dB.Stop()

	// 把 ses_42 绑到 gw-A
	if err := dA.Bind(ctx, "ses_42"); err != nil {
		t.Fatal(err)
	}
	// 在 gw-B 推送 → 跨节点到 gw-A → connA 收到
	n, err := dB.PushSession(ctx, "ses_42", []byte("xnode"))
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("cross-node should not count local; got %d", n)
	}

	// 等待异步投递
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if len(connA.snapshot()) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(connA.snapshot()) != 1 {
		t.Fatalf("connA want 1 got %d", len(connA.snapshot()))
	}
}

func TestDispatcherUnbound(t *testing.T) {
	mem := registry.NewMem()
	defer mem.Close()
	d := New("gw-A", hub.New(), mem, nil)
	n, err := d.PushSession(context.Background(), "ghost", []byte("x"))
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if n != 0 {
		t.Fatalf("want 0 got %d", n)
	}
}
