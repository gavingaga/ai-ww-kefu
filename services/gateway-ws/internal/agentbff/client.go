// Package agentbff 是 gateway-ws → agent-bff 的轻量反向通知客户端。
//
// SessionRouter 在 C 端消息入库 session-svc 之后,fire-and-forget 调一次
// /v1/agent/_internal/session-message,让坐席侧 SSE 实时收到 C 端消息。
package agentbff

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/sessionclient"
)

// Client agent-bff 客户端。
type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

// New 构造客户端。baseURL 为空时所有方法 noop。
func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Token:   token,
		HTTP:    &http.Client{Timeout: 1500 * time.Millisecond},
	}
}

// Enabled 返回是否启用(配了 base URL)。
func (c *Client) Enabled() bool { return c != nil && c.BaseURL != "" }

// NotifySessionMessage fire-and-forget 调一次 /v1/agent/_internal/session-message,
// 失败仅吞掉错误以保证不阻塞主推送链路。
func (c *Client) NotifySessionMessage(ctx context.Context, sessionID string, msg *sessionclient.Message) {
	if !c.Enabled() || msg == nil {
		return
	}
	body, err := json.Marshal(map[string]interface{}{
		"session_id": sessionID,
		"message":    msg,
	})
	if err != nil {
		return
	}
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost,
		c.BaseURL+"/v1/agent/_internal/session-message",
		bytes.NewReader(body),
	)
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if c.Token != "" {
		req.Header.Set("X-Internal-Token", c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	// 忽略非 2xx — 仅日志意义,主链路不该被影响
}
