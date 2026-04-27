package router

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/frame"
	"github.com/ai-kefu/gateway-ws/internal/sessionclient"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

// Session 把客户端业务消息(msg.text/image/file)写入 session-svc,并把入库后的消息
// 以服务端帧形式回送给客户端 — 客户端用 client_msg_id 销账 pending。
//
// M1:仅做"入库 + 回执"的最小动作;M2 起 SessionRouter 之后会有 AIRoute 把 user 消息
// 转给 ai-hub 拿流式回复。
type Session struct {
	Client *sessionclient.Client
	Logger *slog.Logger
}

// NewSession 构造。
func NewSession(c *sessionclient.Client, logger *slog.Logger) *Session {
	if logger == nil {
		logger = slog.Default()
	}
	return &Session{Client: c, Logger: logger}
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
	// 入库回执:服务端推一帧 msg.<type>,带 client_msg_id,客户端清 pending
	payload, _ := json.Marshal(map[string]interface{}{
		"text":          extractText(in.Payload),
		"role":          m.Role,
		"client_msg_id": m.ClientMsgID,
		"server_seq":    m.Seq,
		"msg_id":        m.ID,
	})
	return []frame.Frame{
		{
			Type:        frame.TypeMsgText,
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
