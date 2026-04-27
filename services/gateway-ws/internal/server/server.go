// Package server 装配 HTTP / WebSocket 路由,健康检查与统计端点。
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/ai-kefu/gateway-ws/internal/config"
	"github.com/ai-kefu/gateway-ws/internal/dispatch"
	"github.com/ai-kefu/gateway-ws/internal/frame"
	"github.com/ai-kefu/gateway-ws/internal/hub"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

// Server HTTP 服务器,持有 hub + 升级器 + router + dispatcher。
type Server struct {
	cfg        config.Config
	hub        *hub.Hub
	dispatcher *dispatch.Dispatcher // 可空 — 单进程 noop 模式
	upgrader   websocket.Upgrader
	router     wsconn.Router
	logger     *slog.Logger
}

// New 构造服务器。router 可为空(默认 echo);dispatcher 可空(单进程 noop)。
func New(
	cfg config.Config,
	h *hub.Hub,
	router wsconn.Router,
	dispatcher *dispatch.Dispatcher,
	logger *slog.Logger,
) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	originAllow := buildOriginCheck(cfg.AllowedOrigins)
	return &Server{
		cfg:        cfg,
		hub:        h,
		dispatcher: dispatcher,
		router:     router,
		logger:     logger,
		upgrader:   websocket.Upgrader{CheckOrigin: originAllow, ReadBufferSize: 4096, WriteBufferSize: 4096},
	}
}

// Handler 返回 HTTP mux。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(s.cfg.HealthPath, s.handleHealth)
	mux.HandleFunc(s.cfg.ReadyPath, s.handleReady)
	mux.HandleFunc("/metrics-lite", s.handleStats)
	mux.HandleFunc(s.cfg.WSPath, s.handleWS)
	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleReady(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) handleStats(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.hub.Stats())
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	uid := r.URL.Query().Get("uid")
	if uid == "" {
		uid = "anonymous"
	}
	ws, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Info("upgrade failed", "err", err)
		return
	}
	c := wsconn.New(ws, wsconn.Options{
		Logger:            s.logger,
		Router:            s.router,
		WriteWait:         s.cfg.WriteWait,
		PongWait:          s.cfg.PongWait,
		PingPeriod:        s.cfg.PingPeriod,
		MaxFrameBytes:     s.cfg.MaxFrameBytes,
		MaxPendingPerConn: s.cfg.MaxPendingPerConn,
	}, uid)
	if sid := r.URL.Query().Get("session_id"); sid != "" {
		c.SetSessionID(sid)
	}
	s.hub.Register(c)
	defer s.hub.Unregister(c)

	// 跨节点路由绑定 + 解绑
	if s.dispatcher != nil && c.SessionID() != "" {
		_ = s.dispatcher.Bind(r.Context(), c.SessionID())
		defer func() {
			_ = s.dispatcher.Unbind(context.Background(), c.SessionID())
		}()
	}

	// 欢迎帧
	c.SendFrame(frame.Frame{
		Type:      frame.TypeMsgChunk,
		SessionID: c.SessionID(),
		Payload:   mustJSON(map[string]any{"chunk": "welcome\n", "end": true}),
	})

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	c.Run(ctx)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func buildOriginCheck(allowed []string) func(*http.Request) bool {
	if len(allowed) == 0 {
		// 开发期放开,生产由 GATEWAY_ALLOWED_ORIGINS 限制
		return func(*http.Request) bool { return true }
	}
	set := make(map[string]struct{}, len(allowed))
	for _, o := range allowed {
		set[o] = struct{}{}
	}
	return func(r *http.Request) bool {
		_, ok := set[r.Header.Get("Origin")]
		return ok
	}
}

// ListenAndServe 启动 HTTP 服务器,带优雅停机。
func (s *Server) ListenAndServe(ctx context.Context) error {
	srv := &http.Server{
		Addr:              s.cfg.HTTPAddr,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("gateway-ws listening", "addr", s.cfg.HTTPAddr, "ws", s.cfg.WSPath)
		errCh <- srv.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), s.cfg.GracefulShutdownTime)
		defer cancel()
		s.logger.Info("shutting down")
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	}
}
