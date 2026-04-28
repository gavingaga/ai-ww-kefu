// Package frame 定义 WS 帧结构与协议常量。
//
// 与 packages/proto/ws/{client,events}.schema.json 保持字段一致。
package frame

import (
	"encoding/json"
	"errors"
)

// 客户端 → 服务端 帧 type 常量
const (
	TypeMsgText      = "msg.text"
	TypeMsgImage     = "msg.image"
	TypeMsgFile      = "msg.file"
	TypeMsgRead      = "msg.read"
	TypeMsgRecall    = "msg.recall"
	TypeEventTyping  = "event.typing"
	TypeEventHandoff = "event.handoff"
	TypeEventContext = "event.context"
	TypePing         = "ping"
	TypePong         = "pong"
	TypeAck          = "ack"
	TypePull         = "pull"
	TypeError        = "error"
)

// 服务端 → 客户端 事件常量(节选,详见 events.schema.json)
const (
	TypeMsgChunk            = "msg.chunk"
	TypeMsgFAQ              = "msg.faq"
	TypeMsgCard             = "msg.card"
	TypeMsgSystem           = "msg.system"
	TypeEventQueueUpdate    = "event.queue_update"
	TypeEventAgentJoin      = "event.agent_join"
	TypeEventSessionClose   = "event.session_close"
	TypeEventAnnouncement   = "event.announcement_update"
	TypeEventQuickReply     = "event.quick_reply_update"
	TypeEventFAQUpdate      = "event.faq_update"
	TypeEventFAQCard        = "event.faq_card"
	TypeEventLiveSnapshot   = "event.live_snapshot"
	TypeEventPlayDiagnostic = "event.play_diagnostic"
	TypeEventBridgeCall     = "event.bridge_call"
)

// Frame 通用帧。
type Frame struct {
	Type        string          `json:"type"`
	Seq         int64           `json:"seq,omitempty"`
	Ack         int64           `json:"ack,omitempty"`
	TS          int64           `json:"ts,omitempty"`
	SessionID   string          `json:"session_id,omitempty"`
	MsgID       string          `json:"msg_id,omitempty"`
	ClientMsgID string          `json:"client_msg_id,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
}

// Decode 把字节解码为帧。
func Decode(data []byte) (Frame, error) {
	var f Frame
	if err := json.Unmarshal(data, &f); err != nil {
		return f, err
	}
	if f.Type == "" {
		return f, errors.New("frame: missing type")
	}
	return f, nil
}

// Encode 把帧编码为字节。
func Encode(f Frame) ([]byte, error) {
	return json.Marshal(f)
}

// IsClientMsg 判断是否客户端发送的消息帧(需要写入 session-svc)。
func IsClientMsg(t string) bool {
	switch t {
	case TypeMsgText, TypeMsgImage, TypeMsgFile:
		return true
	}
	return false
}
