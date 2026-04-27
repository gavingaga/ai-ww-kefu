package sessionclient

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAppendMessageHappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/sessions/ses_1/messages" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if got := r.Header.Get("Idempotency-Key"); got != "cmid-1" {
			t.Fatalf("idempotency-key = %s", got)
		}
		body, _ := io.ReadAll(r.Body)
		var req AppendRequest
		_ = json.Unmarshal(body, &req)
		if req.Type != "text" || req.Role != "user" {
			t.Fatalf("bad req: %+v", req)
		}
		_ = json.NewEncoder(w).Encode(Message{
			ID:          "msg_x",
			SessionID:   "ses_1",
			Seq:         42,
			ClientMsgID: req.ClientMsgID,
			Role:        req.Role,
			Type:        req.Type,
			Content:     req.Content,
			Status:      "sent",
		})
	}))
	defer srv.Close()

	c := New(srv.URL)
	m, err := c.AppendMessage(context.Background(), "ses_1", AppendRequest{
		ClientMsgID: "cmid-1",
		Role:        "user",
		Type:        "text",
		Content:     map[string]interface{}{"text": "hello"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if m.Seq != 42 || m.ClientMsgID != "cmid-1" {
		t.Fatalf("unexpected: %+v", m)
	}
}

func TestAppendMessageErrorMaps(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(409)
		_, _ = w.Write([]byte(`{"code":"illegal_state_transition"}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	_, err := c.AppendMessage(context.Background(), "ses_1", AppendRequest{Type: "text"})
	if err == nil {
		t.Fatal("expected error")
	}
}
