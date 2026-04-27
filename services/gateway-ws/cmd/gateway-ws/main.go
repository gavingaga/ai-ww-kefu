// Command gateway-ws — ai-kefu 长连接网关。
//
// 用法:
//
//	gateway-ws                                        # :8080,EchoRouter,单进程
//	SESSION_SVC_URL=http://session-svc:8081 \
//	  gateway-ws                                       # 接入 session-svc 持久化
//	GATEWAY_REGISTRY=mem GATEWAY_NODE_ID=gw-1 \
//	  gateway-ws                                       # 启用跨节点 Registry(进程内 mem 演示)
//	GATEWAY_REGISTRY=redis REDIS_ADDR=redis:6379 \
//	  GATEWAY_NODE_ID=gw-1 gateway-ws                  # 生产 Redis(需 -tags redis 编译)
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/ai-kefu/gateway-ws/internal/config"
	"github.com/ai-kefu/gateway-ws/internal/dispatch"
	"github.com/ai-kefu/gateway-ws/internal/hub"
	"github.com/ai-kefu/gateway-ws/internal/registry"
	"github.com/ai-kefu/gateway-ws/internal/router"
	"github.com/ai-kefu/gateway-ws/internal/server"
	"github.com/ai-kefu/gateway-ws/internal/sessionclient"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	nodeID := resolveNodeID(cfg.NodeID)

	h := hub.New()
	r := buildRouter(cfg, logger)
	reg := buildRegistry(cfg, logger)
	d := dispatch.New(nodeID, h, reg, logger)

	s := server.New(cfg, h, r, d, logger)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := d.Start(ctx); err != nil {
		logger.Error("dispatcher start", "err", err)
		os.Exit(1)
	}
	defer d.Stop()
	defer reg.Close()

	if err := s.ListenAndServe(ctx); err != nil {
		logger.Error("server error", "err", err)
		os.Exit(1)
	}
}

// buildRouter 按配置组装 Router。
func buildRouter(cfg config.Config, logger *slog.Logger) wsconn.Router {
	if cfg.SessionSvcURL == "" {
		logger.Info("router=echo (no SESSION_SVC_URL)")
		return router.NewEcho()
	}
	logger.Info("router=session+echo", "session_svc", cfg.SessionSvcURL)
	cli := sessionclient.New(cfg.SessionSvcURL)
	return router.NewComposite(
		router.NewSession(cli, logger),
		router.NewEcho(),
	)
}

// buildRegistry 按配置选择 Registry。
//
// 默认 noop;mem 仅适合单进程测试;redis 需 `go build -tags redis`。
func buildRegistry(cfg config.Config, logger *slog.Logger) registry.Registry {
	switch cfg.RegistryType {
	case "", "noop":
		logger.Info("registry=noop")
		return registry.NewNoop()
	case "mem":
		logger.Info("registry=mem")
		return registry.NewMem()
	case "redis":
		reg := newRedisRegistry(cfg.RedisAddr)
		if reg == nil {
			logger.Warn("registry=redis 未编译(需 -tags redis),退化为 noop")
			return registry.NewNoop()
		}
		logger.Info("registry=redis", "addr", cfg.RedisAddr)
		return reg
	default:
		logger.Warn("unknown registry,fallback noop", "value", cfg.RegistryType)
		return registry.NewNoop()
	}
}

func resolveNodeID(configured string) string {
	if configured != "" {
		return configured
	}
	if h, err := os.Hostname(); err == nil && h != "" {
		return h
	}
	return "gateway-ws"
}
