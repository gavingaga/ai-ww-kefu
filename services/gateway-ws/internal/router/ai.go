package router

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/aihub"
	"github.com/ai-kefu/gateway-ws/internal/frame"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

// AI 把 msg.text 发到 ai-hub /v1/ai/infer 拿流式事件,
// 实时转 frame 推回客户端。Handle 立即返回(异步 goroutine 推送),
// 不阻塞 wsconn 的 readLoop。
type AI struct {
	Client    *aihub.Client
	Logger    *slog.Logger
	StreamCtx func() context.Context // 可选:自定义生命周期(默认 30s)
}

// NewAI 构造 AI router。
func NewAI(c *aihub.Client, logger *slog.Logger) *AI {
	if logger == nil {
		logger = slog.Default()
	}
	return &AI{Client: c, Logger: logger}
}

// Handle 实现 wsconn.Router。
func (r *AI) Handle(ctx context.Context, conn *wsconn.Conn, in frame.Frame) ([]frame.Frame, error) {
	if in.Type != frame.TypeMsgText || in.SessionID == "" {
		return nil, nil
	}
	text := extractText(in.Payload)
	if text == "" {
		return nil, nil
	}
	go r.streamReply(r.streamContext(ctx), conn, in.SessionID, in.MsgID, text)
	return nil, nil
}

func (r *AI) streamContext(parent context.Context) context.Context {
	if r.StreamCtx != nil {
		return r.StreamCtx()
	}
	if parent == nil {
		parent = context.Background()
	}
	c, _ := context.WithTimeout(parent, 30*time.Second) //nolint:govet // cancel by ctx parent
	return c
}

func (r *AI) streamReply(ctx context.Context, conn *wsconn.Conn, sid, refMsgID, text string) {
	tokens := 0
	emitChunk := func(chunk string, end bool) {
		body, _ := json.Marshal(map[string]interface{}{"chunk": chunk, "end": end})
		conn.SendFrame(frame.Frame{
			Type:      frame.TypeMsgChunk,
			SessionID: sid,
			MsgID:     refMsgID,
			Payload:   body,
		})
	}
	err := r.Client.InferStream(ctx, aihub.InferRequest{
		SessionID: sid,
		UserText:  text,
		Stream:    true,
	}, func(ev aihub.Event) error {
		switch ev.Event {
		case "decision":
			// 把决策结果作为系统消息提示客户端(可被 web-c 用于 UI 状态)
			body, _ := json.Marshal(map[string]interface{}{
				"action":     ev.Action,
				"reason":     ev.Reason,
				"hits":       ev.Hits,
				"confidence": ev.Confidence,
			})
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeEventQueueUpdate, // 暂复用 event 通道,后续可加 event.ai_decision 专属类型
				SessionID: sid,
				Payload:   body,
			})
		case "token":
			if ev.Text != "" {
				tokens += len(ev.Text)
				emitChunk(ev.Text, false)
			}
		case "faq":
			// FAQ 命中:推一帧 msg.faq,客户端按卡片样式渲染;done 仍由后续事件触发
			body, _ := json.Marshal(map[string]interface{}{
				"node_id": ev.NodeID,
				"title":   ev.Title,
				"answer":  ev.Answer,
				"how":     ev.How,
				"score":   ev.Score,
			})
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeMsgFAQ,
				SessionID: sid,
				MsgID:     refMsgID,
				Payload:   body,
			})
		case "tool_call":
			// 工具调用结果以 event.tool_call 推回客户端,UI 渲染为"AI 正在调用工具"提示
			payload := map[string]interface{}{
				"name": ev.Name,
				"args": ev.Args,
			}
			if ev.OK != nil {
				payload["ok"] = *ev.OK
			}
			if ev.Result != nil {
				payload["result"] = ev.Result
			}
			if ev.ErrorDetail != "" {
				payload["error"] = ev.ErrorDetail
			}
			body, _ := json.Marshal(payload)
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeEventToolCall,
				SessionID: sid,
				Payload:   body,
			})
		case "handoff_packet":
			// 转人工接力包 — M3 座席台直连消费,这里同时透传给 C 端用于本地 UI 状态
			body, _ := json.Marshal(ev.Raw)
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeEventHandoffPacket,
				SessionID: sid,
				Payload:   body,
			})
		case "handoff":
			// 转人工系统消息
			body, _ := json.Marshal(map[string]interface{}{
				"text": "已为你转人工,稍候坐席介入。",
				"role": "system",
			})
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeMsgText,
				SessionID: sid,
				Payload:   body,
			})
			emitChunk("", true)
		case "done":
			emitChunk("", true)
		case "error":
			r.Logger.Warn("ai-hub error", "msg", ev.Message, "sid", sid)
			emitChunk("[AI 服务暂时不可用,请稍后再试]", true)
		}
		return nil
	})
	if err != nil {
		r.Logger.Warn("ai-hub stream failed", "err", err, "sid", sid, "tokens", tokens)
		emitChunk("[AI 暂不可用]", true)
	}
}
