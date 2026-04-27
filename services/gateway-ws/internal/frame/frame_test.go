package frame

import (
	"encoding/json"
	"testing"
)

func TestDecodeRequiresType(t *testing.T) {
	if _, err := Decode([]byte(`{}`)); err == nil {
		t.Fatal("expected error for missing type")
	}
}

func TestRoundTrip(t *testing.T) {
	in := Frame{
		Type:        TypeMsgText,
		SessionID:   "ses_1",
		ClientMsgID: "c1",
		Payload:     json.RawMessage(`{"text":"hi"}`),
	}
	b, err := Encode(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := Decode(b)
	if err != nil {
		t.Fatal(err)
	}
	if out.Type != in.Type || out.ClientMsgID != in.ClientMsgID {
		t.Fatalf("mismatch: %+v vs %+v", in, out)
	}
}

func TestIsClientMsg(t *testing.T) {
	cases := map[string]bool{
		TypeMsgText:     true,
		TypeMsgImage:    true,
		TypeMsgFile:     true,
		TypeEventTyping: false,
		TypePing:        false,
	}
	for k, want := range cases {
		if got := IsClientMsg(k); got != want {
			t.Fatalf("%s: want %v got %v", k, want, got)
		}
	}
}
