package server

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/ai-kefu/gateway-ws/internal/config"
	"github.com/ai-kefu/gateway-ws/internal/hub"
)

type recordingConn struct {
	mu  sync.Mutex
	id  string
	sid string
	got [][]byte
}

func (c *recordingConn) ID() string        { return c.id }
func (c *recordingConn) SessionID() string { return c.sid }
func (c *recordingConn) UserID() string    { return "u" }
func (c *recordingConn) Send(p []byte) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	cp := make([]byte, len(p))
	copy(cp, p)
	c.got = append(c.got, cp)
	return true
}
func (c *recordingConn) Close() {}
func (c *recordingConn) snapshot() [][]byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([][]byte, len(c.got))
	copy(out, c.got)
	return out
}

func newServer(cfg config.Config) (*Server, *hub.Hub, *recordingConn) {
	h := hub.New()
	c := &recordingConn{id: "c1", sid: "ses_42"}
	h.Register(c)
	s := New(cfg, h, nil, nil, slog.Default())
	return s, h, c
}

func TestInternalPushHappyPath(t *testing.T) {
	s, _, conn := newServer(config.Config{})
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	body := bytes.NewBufferString(`{"session_id":"ses_42","frame":{"type":"msg.text","payload":{"text":"主管插话","role":"system"}}}`)
	resp, err := http.Post(srv.URL+"/internal/push", "application/json", body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status=%d", resp.StatusCode)
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if out["ok"] != true {
		t.Fatalf("ok=%v", out["ok"])
	}
	got := conn.snapshot()
	if len(got) != 1 {
		t.Fatalf("conn should receive 1, got %d", len(got))
	}
	if !strings.Contains(string(got[0]), "主管插话") {
		t.Fatalf("payload missing text: %s", string(got[0]))
	}
}

func TestInternalPushTokenAuth(t *testing.T) {
	s, _, _ := newServer(config.Config{InternalPushToken: "secret"})
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	// 缺 token → 401
	body := bytes.NewBufferString(`{"session_id":"ses_42","frame":{"type":"msg.text","payload":{}}}`)
	resp, _ := http.Post(srv.URL+"/internal/push", "application/json", body)
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}

	// 带正确 token → 200
	req, _ := http.NewRequest("POST", srv.URL+"/internal/push",
		bytes.NewBufferString(`{"session_id":"ses_42","frame":{"type":"msg.text","payload":{}}}`))
	req.Header.Set("X-Internal-Token", "secret")
	req.Header.Set("Content-Type", "application/json")
	resp2, _ := http.DefaultClient.Do(req)
	if resp2.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp2.StatusCode)
	}
}

func TestInternalPushBadRequest(t *testing.T) {
	s, _, _ := newServer(config.Config{})
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	resp, _ := http.Post(srv.URL+"/internal/push", "application/json",
		bytes.NewBufferString(`{"session_id":"only"}`))
	if resp.StatusCode != 400 {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}
