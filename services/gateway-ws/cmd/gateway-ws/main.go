// Command gateway-ws — ai-kefu 长连接网关。
//
// 用法:
//
//	gateway-ws                                    # :8080,/v1/ws,EchoRouter
//	SESSION_SVC_URL=http://session-svc:8081 \
//	  gateway-ws                                   # 接入 session-svc 持久化
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/ai-kefu/gateway-ws/internal/config"
	"github.com/ai-kefu/gateway-ws/internal/hub"
	"github.com/ai-kefu/gateway-ws/internal/router"
	"github.com/ai-kefu/gateway-ws/internal/server"
	"github.com/ai-kefu/gateway-ws/internal/sessionclient"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	h := hub.New()
	r := buildRouter(cfg, logger)
	s := server.New(cfg, h, r, logger)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := s.ListenAndServe(ctx); err != nil {
		logger.Error("server error", "err", err)
		os.Exit(1)
	}
}

// buildRouter 按配置组装 Router。
//
//   - 仅本地         → EchoRouter
//   - 接 session-svc → Composite(Session, Echo)
//
// EchoRouter 仅作开发期 AI 临时回声,M2 起会被 ai-hub 流式 Router 替换。
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
