// Package router 提供帧路由的若干内置实现。
package router

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/frame"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

// Echo M1 占位 router:把客户端文本帧"流式"回放为 AI 气泡,
// 用于 web-c 联调长连接;接入 ai-hub / session-svc 后由 KafkaRouter 替换。
type Echo struct{}

// NewEcho 构造 Echo router。
func NewEcho() *Echo { return &Echo{} }

// Handle 实现 wsconn.Router。
func (e *Echo) Handle(_ context.Context, _ *wsconn.Conn, in frame.Frame) ([]frame.Frame, error) {
	switch in.Type {
	case frame.TypeMsgText:
		text := extractText(in.Payload)
		if text == "" {
			return nil, nil
		}
		// 1) 先回送 ack 形式的服务端回执(同 client_msg_id)
		ackPayload, _ := json.Marshal(map[string]any{
			"client_msg_id": in.ClientMsgID,
			"text":          text,
			"role":          "user",
		})
		// 2) 再发一帧 AI 系统回应
		reply := "已收到。当前为 gateway-ws Echo router,实际对话能力将在 M2 接入 ai-hub 后启用。"
		replyPayload, _ := json.Marshal(map[string]any{
			"text": reply,
			"role": "ai",
			"hint": strings.TrimSpace(text),
		})
		return []frame.Frame{
			{
				Type:        frame.TypeMsgText,
				SessionID:   in.SessionID,
				ClientMsgID: in.ClientMsgID,
				TS:          time.Now().UnixMilli(),
				Payload:     ackPayload,
			},
			{
				Type:      frame.TypeMsgText,
				SessionID: in.SessionID,
				TS:        time.Now().UnixMilli(),
				Payload:   replyPayload,
			},
		}, nil
	case frame.TypePull:
		// 尚无离线消息缓存,回个空帧
		return nil, nil
	}
	return nil, nil
}

func extractText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var p struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return ""
	}
	return p.Text
}
