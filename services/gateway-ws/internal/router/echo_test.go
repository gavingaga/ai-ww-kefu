package router

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/ai-kefu/gateway-ws/internal/frame"
)

func TestEchoTextProducesAckAndAIReply(t *testing.T) {
	r := NewEcho()
	in := frame.Frame{
		Type:        frame.TypeMsgText,
		SessionID:   "ses_1",
		ClientMsgID: "cmid-1",
		Payload:     json.RawMessage(`{"text":"hello"}`),
	}
	out, err := r.Handle(context.Background(), nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 {
		t.Fatalf("want 2 frames, got %d", len(out))
	}
	if out[0].ClientMsgID != "cmid-1" {
		t.Fatalf("ack should keep client_msg_id")
	}
	if !strings.Contains(string(out[1].Payload), "ai") {
		t.Fatalf("second frame should be ai role, got %s", string(out[1].Payload))
	}
}

func TestEchoIgnoresEmptyText(t *testing.T) {
	r := NewEcho()
	in := frame.Frame{Type: frame.TypeMsgText, Payload: json.RawMessage(`{}`)}
	out, err := r.Handle(context.Background(), nil, in)
	if err != nil || len(out) != 0 {
		t.Fatalf("want empty,got %d frames err=%v", len(out), err)
	}
}
