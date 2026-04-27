package registry

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestMemBindLookup(t *testing.T) {
	r := NewMem()
	defer r.Close()
	if err := r.Bind(context.Background(), "ses_1", "gw-A", time.Minute); err != nil {
		t.Fatal(err)
	}
	got, err := r.Lookup(context.Background(), "ses_1")
	if err != nil {
		t.Fatal(err)
	}
	if got != "gw-A" {
		t.Fatalf("want gw-A got %s", got)
	}
}

func TestMemTTLExpires(t *testing.T) {
	r := NewMem()
	_ = r.Bind(context.Background(), "ses_1", "gw-A", 5*time.Millisecond)
	time.Sleep(20 * time.Millisecond)
	_, err := r.Lookup(context.Background(), "ses_1")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound got %v", err)
	}
}

func TestMemUnbindOnlyMatchingNode(t *testing.T) {
	r := NewMem()
	_ = r.Bind(context.Background(), "ses_1", "gw-A", time.Minute)
	_ = r.Unbind(context.Background(), "ses_1", "gw-B") // 不匹配 → 不动
	got, _ := r.Lookup(context.Background(), "ses_1")
	if got != "gw-A" {
		t.Fatalf("should still bound to gw-A, got %s", got)
	}
	_ = r.Unbind(context.Background(), "ses_1", "gw-A")
	if _, err := r.Lookup(context.Background(), "ses_1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("should be unbound now")
	}
}

func TestMemPubSub(t *testing.T) {
	r := NewMem()
	defer r.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := r.Subscribe(ctx, "gw-A")
	if err != nil {
		t.Fatal(err)
	}
	if err := r.Publish(context.Background(), "gw-A", []byte("hello")); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-ch:
		if string(got) != "hello" {
			t.Fatalf("got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for publish")
	}
}

func TestMemUnsubscribeOnCtxCancel(t *testing.T) {
	r := NewMem()
	defer r.Close()
	ctx, cancel := context.WithCancel(context.Background())
	ch, _ := r.Subscribe(ctx, "gw-A")
	cancel()
	// 等待 unsubscribe 异步执行
	time.Sleep(20 * time.Millisecond)
	// publish 不应再投递
	_ = r.Publish(context.Background(), "gw-A", []byte("x"))
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected channel closed")
		}
	default:
		// 也接受未读到的状态(channel 已 close 但未读取)
	}
}
