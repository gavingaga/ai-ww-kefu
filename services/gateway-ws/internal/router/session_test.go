package router

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ai-kefu/gateway-ws/internal/frame"
	"github.com/ai-kefu/gateway-ws/internal/sessionclient"
)

func TestSessionRouterPersistsAndAcks(t *testing.T) {
	called := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		var req sessionclient.AppendRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		_ = json.NewEncoder(w).Encode(sessionclient.Message{
			ID:          "msg_1",
			SessionID:   "ses_1",
			Seq:         3,
			ClientMsgID: req.ClientMsgID,
			Role:        "user",
			Type:        req.Type,
			Content:     req.Content,
		})
	}))
	defer srv.Close()

	r := NewSession(sessionclient.New(srv.URL), nil)
	in := frame.Frame{
		Type:        frame.TypeMsgText,
		SessionID:   "ses_1",
		ClientMsgID: "cmid-x",
		Payload:     json.RawMessage(`{"text":"hi"}`),
	}
	out, err := r.Handle(context.Background(), nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if called != 1 {
		t.Fatalf("session-svc called %d times, want 1", called)
	}
	if len(out) != 1 || out[0].ClientMsgID != "cmid-x" || out[0].MsgID != "msg_1" {
		t.Fatalf("bad ack: %+v", out)
	}
}

func TestSessionRouterEmitsErrorOnFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()
	r := NewSession(sessionclient.New(srv.URL), nil)
	out, _ := r.Handle(context.Background(), nil, frame.Frame{
		Type:      frame.TypeMsgText,
		SessionID: "ses_1",
		Payload:   json.RawMessage(`{"text":"hi"}`),
	})
	if len(out) != 1 || out[0].Type != frame.TypeError {
		t.Fatalf("expected error frame, got %+v", out)
	}
}

func TestSessionRouterIgnoresNonMessageFrames(t *testing.T) {
	r := NewSession(sessionclient.New("http://no-where"), nil)
	out, err := r.Handle(context.Background(), nil, frame.Frame{Type: frame.TypePull})
	if err != nil || out != nil {
		t.Fatalf("non-msg should be ignored, got %+v err=%v", out, err)
	}
}
