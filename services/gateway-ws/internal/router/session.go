package router

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/agentbff"
	"github.com/ai-kefu/gateway-ws/internal/frame"
	"github.com/ai-kefu/gateway-ws/internal/sessionclient"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

// Session 把客户端业务消息(msg.text/image/file)写入 session-svc,并把入库后的消息
// 以服务端帧形式回送给客户端 — 客户端用 client_msg_id 销账 pending。
//
// 在 append 成功后,fire-and-forget 调 agent-bff /v1/agent/_internal/session-message,
// 让坐席侧 SSE 实时收到 C 端消息(M3 起步消除当前会话 4s 轮询)。
type Session struct {
	Client   *sessionclient.Client
	BffPush  *agentbff.Client
	Logger   *slog.Logger
}

// NewSession 构造;bff 可空(关闭反向通知)。
func NewSession(
	c *sessionclient.Client,
	bff *agentbff.Client,
	logger *slog.Logger,
) *Session {
	if logger == nil {
		logger = slog.Default()
	}
	return &Session{Client: c, BffPush: bff, Logger: logger}
}

// Handle 实现 wsconn.Router。
func (s *Session) Handle(ctx context.Context, _ *wsconn.Conn, in frame.Frame) ([]frame.Frame, error) {
	if !frame.IsClientMsg(in.Type) || in.SessionID == "" {
		return nil, nil
	}
	content := decodeContent(in.Payload)
	contentType := contentTypeFor(in.Type)
	reqCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	m, err := s.Client.AppendMessage(reqCtx, in.SessionID, sessionclient.AppendRequest{
		ClientMsgID: in.ClientMsgID,
		Role:        "user",
		Type:        contentType,
		Content:     content,
	})
	if err != nil {
		s.Logger.Warn("session append failed", "err", err, "sid", in.SessionID)
		body, _ := json.Marshal(map[string]string{
			"code":    "session_append_failed",
			"message": err.Error(),
		})
		return []frame.Frame{
			{Type: frame.TypeError, SessionID: in.SessionID, Payload: body},
		}, nil
	}
	// 反向通知 agent-bff:让坐席侧 SSE 实时收到 C 端消息。
	// 用独立 ctx + goroutine,既不阻塞回执也不被 reqCtx 提前取消。
	if s.BffPush != nil && s.BffPush.Enabled() {
		mCopy := m
		go func() {
			notifyCtx, notifyCancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
			defer notifyCancel()
			s.BffPush.NotifySessionMessage(notifyCtx, in.SessionID, mCopy)
		}()
	}

	// 入库回执:Type 与原帧一致(text/image/file),payload 透传 content + 服务端写入元信息。
	// 这样图片/文件回执也能保留 url/filename/size,客户端按 client_msg_id 替换本地预览。
	ackPayload := map[string]interface{}{
		"role":          m.Role,
		"client_msg_id": m.ClientMsgID,
		"server_seq":    m.Seq,
		"msg_id":        m.ID,
	}
	for k, v := range content {
		// content 字段优先(url/filename/size/content_type/text),不被服务端元信息覆盖
		if _, taken := ackPayload[k]; !taken {
			ackPayload[k] = v
		}
	}
	if _, hasText := ackPayload["text"]; !hasText {
		if t := extractText(in.Payload); t != "" {
			ackPayload["text"] = t
		}
	}
	payload, _ := json.Marshal(ackPayload)
	return []frame.Frame{
		{
			Type:        in.Type,
			SessionID:   in.SessionID,
			ClientMsgID: m.ClientMsgID,
			MsgID:       m.ID,
			Payload:     payload,
		},
	}, nil
}

func decodeContent(raw json.RawMessage) map[string]interface{} {
	if len(raw) == 0 {
		return nil
	}
	var c map[string]interface{}
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil
	}
	return c
}

func contentTypeFor(t string) string {
	switch t {
	case frame.TypeMsgText:
		return "text"
	case frame.TypeMsgImage:
		return "image"
	case frame.TypeMsgFile:
		return "file"
	}
	return "text"
}
