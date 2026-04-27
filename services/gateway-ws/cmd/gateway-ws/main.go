// Command gateway-ws — ai-kefu 长连接网关。
//
// 用法:
//
//	gateway-ws                       # 默认 :8080,/v1/ws
//	GATEWAY_HTTP_ADDR=:9000 \
//	GATEWAY_WS_PATH=/ws \
//	GATEWAY_ALLOWED_ORIGINS=http://localhost:5173,https://example.com \
//	gateway-ws
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
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	h := hub.New()
	r := router.NewEcho()
	s := server.New(cfg, h, r, logger)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := s.ListenAndServe(ctx); err != nil {
		logger.Error("server error", "err", err)
		os.Exit(1)
	}
}
