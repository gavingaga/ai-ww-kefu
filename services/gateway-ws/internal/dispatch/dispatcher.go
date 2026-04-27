// Package dispatch 把本地 hub 与跨节点 registry 组合成统一的「按 session 推送」入口。
//
// 行为:
//
//	1. PushSession(sid) — 先 hub.PushSession 本地直推
//	2. 若本地 0 命中,registry.Lookup → 找到目标 node → registry.Publish(payload+sid)
//	3. 各节点订阅自身 channel,收到后回写本地 hub.PushSession
//
// 适配 PRD 07-高可用.md §2.4(横向扩展)与 §3(消息可靠性 — 跨节点路径)。
package dispatch

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/hub"
	"github.com/ai-kefu/gateway-ws/internal/registry"
)

const defaultBindTTL = 60 * time.Second

// Dispatcher hub + registry 组合。
type Dispatcher struct {
	NodeID   string
	Hub      *hub.Hub
	Reg      registry.Registry
	BindTTL  time.Duration
	Logger   *slog.Logger
	cancelFn context.CancelFunc
}

// New 构造。
func New(nodeID string, h *hub.Hub, reg registry.Registry, logger *slog.Logger) *Dispatcher {
	if logger == nil {
		logger = slog.Default()
	}
	return &Dispatcher{
		NodeID:  nodeID,
		Hub:     h,
		Reg:     reg,
		BindTTL: defaultBindTTL,
		Logger:  logger.With("node", nodeID),
	}
}

// Start 在后台跑 registry 订阅 + 周期续约;返回 context cancel 由调用方触发停止。
func (d *Dispatcher) Start(parent context.Context) error {
	ctx, cancel := context.WithCancel(parent)
	d.cancelFn = cancel
	ch, err := d.Reg.Subscribe(ctx, d.NodeID)
	if err != nil {
		cancel()
		return err
	}
	go d.consumeLoop(ctx, ch)
	go d.refreshLoop(ctx)
	return nil
}

// Stop 触发 Start 的 ctx 取消,回收订阅与续约 goroutine。
func (d *Dispatcher) Stop() {
	if d.cancelFn != nil {
		d.cancelFn()
	}
}

// Bind 把 sessionID 绑到本节点。
func (d *Dispatcher) Bind(ctx context.Context, sessionID string) error {
	if sessionID == "" {
		return nil
	}
	return d.Reg.Bind(ctx, sessionID, d.NodeID, d.BindTTL)
}

// Unbind 释放本节点对 sessionID 的持有。
func (d *Dispatcher) Unbind(ctx context.Context, sessionID string) error {
	if sessionID == "" {
		return nil
	}
	return d.Reg.Unbind(ctx, sessionID, d.NodeID)
}

// PushSession 本地命中即返回(>0);否则按 registry.Lookup 跨节点 Publish。
//
// 返回值是"本地直接送达数量"。跨节点投递成功不计入(由远端 hub 负责)。
func (d *Dispatcher) PushSession(ctx context.Context, sessionID string, payload []byte) (int, error) {
	if local := d.Hub.PushSession(sessionID, payload); local > 0 {
		return local, nil
	}
	target, err := d.Reg.Lookup(ctx, sessionID)
	if err != nil {
		if errors.Is(err, registry.ErrNotFound) {
			return 0, nil
		}
		return 0, err
	}
	if target == d.NodeID {
		// 本节点其实有,但 hub 没找到对应连接 — 视为离线,丢弃跨节点 publish。
		return 0, nil
	}
	wrap, err := wrapPayload(sessionID, payload)
	if err != nil {
		return 0, err
	}
	if err := d.Reg.Publish(ctx, target, wrap); err != nil {
		return 0, err
	}
	return 0, nil
}

func (d *Dispatcher) consumeLoop(ctx context.Context, ch <-chan []byte) {
	for {
		select {
		case <-ctx.Done():
			return
		case raw, ok := <-ch:
			if !ok {
				return
			}
			sid, payload, err := unwrapPayload(raw)
			if err != nil {
				d.Logger.Warn("bad cross-node frame", "err", err)
				continue
			}
			n := d.Hub.PushSession(sid, payload)
			if n == 0 {
				d.Logger.Debug("cross-node frame dropped, no local conn", "sid", sid)
			}
		}
	}
}

func (d *Dispatcher) refreshLoop(ctx context.Context) {
	t := time.NewTicker(d.BindTTL / 3)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			d.refreshActive(ctx)
		}
	}
}

func (d *Dispatcher) refreshActive(ctx context.Context) {
	stats := d.Hub.Stats()
	if stats.Sessions == 0 {
		return
	}
	for _, sid := range d.Hub.ActiveSessionIDs() {
		_ = d.Reg.Refresh(ctx, sid, d.NodeID, d.BindTTL)
	}
}

// envelope 跨节点投递时把 sid + payload 一起封装。
type envelope struct {
	SID     string `json:"sid"`
	Payload []byte `json:"p"`
}

func wrapPayload(sessionID string, payload []byte) ([]byte, error) {
	return json.Marshal(envelope{SID: sessionID, Payload: payload})
}

func unwrapPayload(raw []byte) (string, []byte, error) {
	var e envelope
	if err := json.Unmarshal(raw, &e); err != nil {
		return "", nil, err
	}
	if e.SID == "" {
		return "", nil, errors.New("empty sid")
	}
	return e.SID, e.Payload, nil
}
