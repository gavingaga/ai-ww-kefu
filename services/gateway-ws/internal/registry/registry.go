// Package registry 提供 session_id ↔ node_id 映射与跨节点 Pub/Sub。
//
// M1 单进程默认 Noop;多节点演示 / 单测使用 Mem;生产用 Redis(实现见
// `redis_registry.go`,需 `go build -tags redis`)。详见 PRD 07-高可用.md §2 §4。
package registry

import (
	"context"
	"errors"
	"time"
)

// ErrNotFound 路由表中找不到 session 对应的节点。
var ErrNotFound = errors.New("registry: session not bound")

// Registry session 路由 + 跨节点消息总线。
//
// 实现需要保证:
//
//	Bind 之后 Lookup 必得到该绑定;过期或 Unbind 后必返 ErrNotFound。
//	Subscribe 返回的 channel 在 ctx.Done() 后必关闭。
type Registry interface {
	// Bind 把 sessionID 绑定到 nodeID(默认续约 ttl,过期自动清理)。
	Bind(ctx context.Context, sessionID, nodeID string, ttl time.Duration) error
	// Refresh 续约;若已过期,等价 Bind。
	Refresh(ctx context.Context, sessionID, nodeID string, ttl time.Duration) error
	// Unbind 解绑(connect close 时调)。仅当当前持有者匹配 nodeID 才清理。
	Unbind(ctx context.Context, sessionID, nodeID string) error
	// Lookup 查询 sessionID 绑定的 nodeID。
	Lookup(ctx context.Context, sessionID string) (nodeID string, err error)
	// Subscribe 订阅本节点的跨节点消息。channel 直到 ctx 取消或 Close 才关闭。
	Subscribe(ctx context.Context, nodeID string) (<-chan []byte, error)
	// Publish 把 payload 发到指定节点的跨节点消息总线。
	Publish(ctx context.Context, nodeID string, payload []byte) error
	// Close 释放底层资源。
	Close() error
}
