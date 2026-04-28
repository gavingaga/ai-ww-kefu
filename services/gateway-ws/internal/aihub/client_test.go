package aihub

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func sseServer(events []string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		for _, e := range events {
			fmt.Fprintf(w, "data: %s\n\n", e)
			if flusher != nil {
				flusher.Flush()
			}
		}
	}))
}

func TestInferStreamHandoffPath(t *testing.T) {
	srv := sseServer([]string{
		`{"event":"decision","action":"handoff","hits":["投诉"]}`,
		`{"event":"handoff","reason":"rule_keyword","hits":["投诉"]}`,
		`{"event":"done"}`,
	})
	defer srv.Close()
	c := New(srv.URL)
	got := []string{}
	err := c.InferStream(context.Background(),
		InferRequest{SessionID: "s", UserText: "我要投诉"},
		func(ev Event) error {
			got = append(got, ev.Event+"|"+ev.Action)
			return nil
		})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"decision|handoff", "handoff|", "done|"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestInferStreamLLMTokens(t *testing.T) {
	srv := sseServer([]string{
		`{"event":"decision","action":"llm_general"}`,
		`{"event":"token","text":"你"}`,
		`{"event":"token","text":"好"}`,
		`{"event":"done","tokens_out":2}`,
	})
	defer srv.Close()
	c := New(srv.URL)
	tokens := ""
	tokensOut := 0
	err := c.InferStream(context.Background(),
		InferRequest{SessionID: "s", UserText: "hi"},
		func(ev Event) error {
			if ev.Event == "token" {
				tokens += ev.Text
			}
			if ev.Event == "done" {
				tokensOut = ev.TokensOut
			}
			return nil
		})
	if err != nil {
		t.Fatal(err)
	}
	if tokens != "你好" || tokensOut != 2 {
		t.Fatalf("tokens=%q tokensOut=%d", tokens, tokensOut)
	}
}

func TestInferStreamHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(503)
		_, _ = w.Write([]byte(`oops`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	err := c.InferStream(context.Background(), InferRequest{SessionID: "s", UserText: "x"}, func(Event) error { return nil })
	if err == nil {
		t.Fatal("expected error")
	}
}
