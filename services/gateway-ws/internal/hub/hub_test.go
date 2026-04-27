package hub

import (
	"sync"
	"sync/atomic"
	"testing"
)

type fakeConn struct {
	id, sid, uid string
	mu           sync.Mutex
	got          [][]byte
	dropped      atomic.Int64
	limit        int
}

func newFake(id, sid string) *fakeConn {
	return &fakeConn{id: id, sid: sid, uid: "u-" + id, limit: 1024}
}

func (f *fakeConn) ID() string        { return f.id }
func (f *fakeConn) SessionID() string { return f.sid }
func (f *fakeConn) UserID() string    { return f.uid }
func (f *fakeConn) Send(p []byte) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.got) >= f.limit {
		f.dropped.Add(1)
		return false
	}
	f.got = append(f.got, p)
	return true
}
func (f *fakeConn) Close() {}

func TestRegisterAndPushSession(t *testing.T) {
	h := New()
	a := newFake("a", "ses1")
	b := newFake("b", "ses1")
	c := newFake("c", "ses2")
	h.Register(a)
	h.Register(b)
	h.Register(c)

	if got := h.PushSession("ses1", []byte("hi")); got != 2 {
		t.Fatalf("ses1 push want 2 got %d", got)
	}
	if got := h.PushSession("ses-missing", []byte("x")); got != 0 {
		t.Fatalf("missing push want 0 got %d", got)
	}

	stats := h.Stats()
	if stats.Connections != 3 {
		t.Fatalf("connections want 3 got %d", stats.Connections)
	}
	if stats.Sessions != 2 {
		t.Fatalf("sessions want 2 got %d", stats.Sessions)
	}
}

func TestUnregisterCleansSessionBucket(t *testing.T) {
	h := New()
	a := newFake("a", "ses1")
	h.Register(a)
	h.Unregister(a)
	if got := h.Stats().Sessions; got != 0 {
		t.Fatalf("sessions after unregister want 0 got %d", got)
	}
}

func TestAttachSessionMoves(t *testing.T) {
	h := New()
	a := newFake("a", "ses-old")
	h.Register(a)
	h.AttachSession(a, "ses-new")
	a.sid = "ses-new"
	if got := h.PushSession("ses-old", []byte("x")); got != 0 {
		t.Fatalf("old should be empty, got %d", got)
	}
	if got := h.PushSession("ses-new", []byte("y")); got != 1 {
		t.Fatalf("new should receive 1, got %d", got)
	}
}

func TestBroadcast(t *testing.T) {
	h := New()
	for i := 0; i < 5; i++ {
		h.Register(newFake(string(rune('a'+i)), "ses"))
	}
	if got := h.Broadcast([]byte("ping")); got != 5 {
		t.Fatalf("broadcast want 5 got %d", got)
	}
}
