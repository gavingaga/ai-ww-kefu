package registry

import (
	"context"
	"time"
)

// Noop 单进程模式。所有 Bind/Refresh/Unbind 立即成功;Lookup 返回 ErrNotFound;
// Subscribe 返回永不收到消息的 channel(随 ctx 关闭)。
type Noop struct{}

// NewNoop 构造。
func NewNoop() *Noop { return &Noop{} }

// Bind 实现 Registry。
func (Noop) Bind(_ context.Context, _, _ string, _ time.Duration) error { return nil }

// Refresh 实现 Registry。
func (Noop) Refresh(_ context.Context, _, _ string, _ time.Duration) error { return nil }

// Unbind 实现 Registry。
func (Noop) Unbind(_ context.Context, _, _ string) error { return nil }

// Lookup 实现 Registry。
func (Noop) Lookup(_ context.Context, _ string) (string, error) { return "", ErrNotFound }

// Subscribe 实现 Registry。
func (Noop) Subscribe(ctx context.Context, _ string) (<-chan []byte, error) {
	ch := make(chan []byte)
	go func() {
		<-ctx.Done()
		close(ch)
	}()
	return ch, nil
}

// Publish 实现 Registry。无目标可达,直接吞掉。
func (Noop) Publish(_ context.Context, _ string, _ []byte) error { return nil }

// Close 实现 Registry。
func (Noop) Close() error { return nil }
