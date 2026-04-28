package router

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/agentbff"
	"github.com/ai-kefu/gateway-ws/internal/aihub"
	"github.com/ai-kefu/gateway-ws/internal/frame"
	"github.com/ai-kefu/gateway-ws/internal/sessionclient"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

// AI 把 msg.text 发到 ai-hub /v1/ai/infer 拿流式事件,
// 实时转 frame 推回客户端;同时把 AI 答复 / FAQ / 转人工系统消息持久化到 session-svc,
// 让坐席台与历史回放看到完整对话。
//
// Handle 立即返回(异步 goroutine 推送),不阻塞 wsconn 的 readLoop。
type AI struct {
	Client    *aihub.Client
	Session   *sessionclient.Client // 可空,关闭则不入库
	BffPush   *agentbff.Client      // 可空
	Logger    *slog.Logger
	StreamCtx func() context.Context // 可选:自定义生命周期(默认 30s)
}

// NewAI 构造 AI router。session/bff 可空(不持久化、不反向通知)。
func NewAI(
	c *aihub.Client,
	session *sessionclient.Client,
	bff *agentbff.Client,
	logger *slog.Logger,
) *AI {
	if logger == nil {
		logger = slog.Default()
	}
	return &AI{Client: c, Session: session, BffPush: bff, Logger: logger}
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
	var aiBuffer strings.Builder
	var (
		decisionAction string
		decisionReason string
		ragTopTitle    string
		ragScore       float64
		ragChunks      []map[string]interface{}
		toolCalls      []map[string]interface{}
		faqPersisted   bool
		aiPersisted    bool
		handoffPersist bool
	)
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
			decisionAction = ev.Action
			decisionReason = ev.Reason
			body, _ := json.Marshal(map[string]interface{}{
				"action":     ev.Action,
				"reason":     ev.Reason,
				"hits":       ev.Hits,
				"confidence": ev.Confidence,
			})
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeEventQueueUpdate,
				SessionID: sid,
				Payload:   body,
			})
		case "token":
			if ev.Text != "" {
				tokens += len(ev.Text)
				aiBuffer.WriteString(ev.Text)
				emitChunk(ev.Text, false)
			}
		case "faq":
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
			r.persistFAQ(ctx, sid, ev)
			faqPersisted = true
		case "tool_call":
			tc := map[string]interface{}{"name": ev.Name, "args": ev.Args}
			if ev.OK != nil {
				tc["ok"] = *ev.OK
			}
			if ev.Result != nil {
				tc["result"] = ev.Result
			}
			if ev.ErrorDetail != "" {
				tc["error"] = ev.ErrorDetail
			}
			toolCalls = append(toolCalls, tc)
			body, _ := json.Marshal(tc)
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeEventToolCall,
				SessionID: sid,
				Payload:   body,
			})
		case "handoff_packet":
			body, _ := json.Marshal(ev.Raw)
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeEventHandoffPacket,
				SessionID: sid,
				Payload:   body,
			})
		case "rag_chunks":
			ragTopTitle = ev.TopTitle
			ragScore = ev.Score
			ragChunks = ev.Chunks
			body, _ := json.Marshal(map[string]interface{}{
				"score":     ev.Score,
				"top_title": ev.TopTitle,
				"chunks":    ev.Chunks,
			})
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeEventRAGChunks,
				SessionID: sid,
				Payload:   body,
			})
		case "handoff":
			handoffText := "已为你转人工,稍候坐席介入。"
			body, _ := json.Marshal(map[string]interface{}{
				"text": handoffText,
				"role": "system",
			})
			conn.SendFrame(frame.Frame{
				Type:      frame.TypeMsgText,
				SessionID: sid,
				Payload:   body,
			})
			r.persistHandoff(ctx, sid, refMsgID, handoffText, decisionReason, ev.Hits)
			handoffPersist = true
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

	// 流结束后,如果走的是 LLM 答复路径(有 token 输出且未走 FAQ / handoff),把聚合文本入库
	finalText := aiBuffer.String()
	if !aiPersisted && !faqPersisted && !handoffPersist && strings.TrimSpace(finalText) != "" {
		r.persistAIText(ctx, sid, refMsgID, finalText, decisionAction, decisionReason,
			ragTopTitle, ragScore, ragChunks, toolCalls)
	}
}

// persistAIText 把 LLM 流式回复的聚合文本写入 session-svc + 反向通知坐席侧。
func (r *AI) persistAIText(
	ctx context.Context,
	sid, refMsgID, text, decisionAction, decisionReason, ragTopTitle string,
	ragScore float64,
	ragChunks []map[string]interface{},
	toolCalls []map[string]interface{},
) {
	if r.Session == nil {
		return
	}
	aiMeta := map[string]interface{}{
		"decision_action": decisionAction,
		"decision_reason": decisionReason,
		"ref_user_msg_id": refMsgID,
		"tokens_out":      len(text),
	}
	if ragTopTitle != "" {
		aiMeta["rag_top_title"] = ragTopTitle
		aiMeta["rag_score"] = ragScore
		if len(ragChunks) > 0 {
			aiMeta["rag_chunks"] = ragChunks
		}
	}
	if len(toolCalls) > 0 {
		aiMeta["tool_calls"] = toolCalls
	}
	r.persistAndNotify(ctx, sid, sessionclient.AppendRequest{
		ClientMsgID: "ai-" + refMsgID,
		Role:        "ai",
		Type:        "text",
		Content:     map[string]interface{}{"text": text},
		AIMeta:      aiMeta,
	})
}

// persistFAQ 把 FAQ 命中写入(以 type=faq + role=ai)。
func (r *AI) persistFAQ(ctx context.Context, sid string, ev aihub.Event) {
	if r.Session == nil {
		return
	}
	r.persistAndNotify(ctx, sid, sessionclient.AppendRequest{
		ClientMsgID: "faq-" + ev.NodeID,
		Role:        "ai",
		Type:        "faq",
		Content: map[string]interface{}{
			"node_id": ev.NodeID,
			"title":   ev.Title,
			"answer":  ev.Answer,
			"how":     ev.How,
			"score":   ev.Score,
		},
		AIMeta: map[string]interface{}{
			"decision_action": "faq",
			"decision_reason": "faq_" + ev.How,
		},
	})
}

// persistHandoff 把"已为你转人工"系统消息入库。
func (r *AI) persistHandoff(
	ctx context.Context,
	sid, refMsgID, text, reason string,
	hits []string,
) {
	if r.Session == nil {
		return
	}
	r.persistAndNotify(ctx, sid, sessionclient.AppendRequest{
		ClientMsgID: "handoff-" + refMsgID,
		Role:        "system",
		Type:        "system",
		Content:     map[string]interface{}{"text": text, "sub": "handoff"},
		AIMeta: map[string]interface{}{
			"reason": reason,
			"hits":   hits,
		},
	})
}

// persistAndNotify 异步写入 session-svc;成功后通知 agent-bff,让坐席侧 SSE 实时收到。
func (r *AI) persistAndNotify(
	parent context.Context,
	sid string,
	req sessionclient.AppendRequest,
) {
	go func() {
		writeCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		m, err := r.Session.AppendMessage(writeCtx, sid, req)
		if err != nil {
			r.Logger.Warn("AI persist failed", "err", err, "sid", sid, "role", req.Role)
			return
		}
		if r.BffPush != nil && r.BffPush.Enabled() {
			notifyCtx, ncancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
			defer ncancel()
			r.BffPush.NotifySessionMessage(notifyCtx, sid, m)
		}
		_ = parent // 仅为防止 lint;入库链路使用独立 ctx
	}()
}
