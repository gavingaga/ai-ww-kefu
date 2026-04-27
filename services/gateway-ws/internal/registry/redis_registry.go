//go:build redis

// Redis 实现 — 默认编译不引入,生产构建用 `go build -tags redis ./...`
//
// 设计:
//   - Bind/Refresh:`SET kefu:gw:bind:<sid> <node> EX <ttl>`
//   - Unbind:Lua 校验持有者后再 DEL
//   - Lookup:`GET`
//   - Subscribe/Publish:Pub/Sub channel `kefu:gw:node:<node>`
//
// 注意:Pub/Sub 不保证投递,适合"实时推送 + 客户端断连重新拉历史"的场景;
// 如对丢包敏感,改走 Redis Stream(待 T-103 / 容灾演练评估)。
package registry

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	bindKeyPrefix = "kefu:gw:bind:"
	subKeyPrefix  = "kefu:gw:node:"
)

const unbindLua = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`

// Redis Registry 实现。
type Redis struct {
	rdb *redis.Client
}

// NewRedis 构造。
func NewRedis(addr string) *Redis {
	return &Redis{rdb: redis.NewClient(&redis.Options{Addr: addr})}
}

// Bind 实现 Registry。
func (r *Redis) Bind(ctx context.Context, sessionID, nodeID string, ttl time.Duration) error {
	return r.rdb.Set(ctx, bindKeyPrefix+sessionID, nodeID, ttl).Err()
}

// Refresh 实现 Registry。
func (r *Redis) Refresh(ctx context.Context, sessionID, nodeID string, ttl time.Duration) error {
	return r.Bind(ctx, sessionID, nodeID, ttl)
}

// Unbind 实现 Registry。
func (r *Redis) Unbind(ctx context.Context, sessionID, nodeID string) error {
	return r.rdb.Eval(ctx, unbindLua, []string{bindKeyPrefix + sessionID}, nodeID).Err()
}

// Lookup 实现 Registry。
func (r *Redis) Lookup(ctx context.Context, sessionID string) (string, error) {
	v, err := r.rdb.Get(ctx, bindKeyPrefix+sessionID).Result()
	if errors.Is(err, redis.Nil) {
		return "", ErrNotFound
	}
	return v, err
}

// Subscribe 实现 Registry。
func (r *Redis) Subscribe(ctx context.Context, nodeID string) (<-chan []byte, error) {
	pubsub := r.rdb.Subscribe(ctx, subKeyPrefix+nodeID)
	out := make(chan []byte, 64)
	go func() {
		defer close(out)
		defer pubsub.Close()
		ch := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case m, ok := <-ch:
				if !ok {
					return
				}
				out <- []byte(m.Payload)
			}
		}
	}()
	return out, nil
}

// Publish 实现 Registry。
func (r *Redis) Publish(ctx context.Context, nodeID string, payload []byte) error {
	return r.rdb.Publish(ctx, subKeyPrefix+nodeID, payload).Err()
}

// Close 实现 Registry。
func (r *Redis) Close() error {
	return r.rdb.Close()
}
