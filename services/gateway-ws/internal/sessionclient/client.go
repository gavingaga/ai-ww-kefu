// Package sessionclient 是 gateway-ws → session-svc 的轻量 HTTP 客户端。
//
// M1 阶段 session-svc 与 gateway-ws 是 1:1 同 region 部署,直连即可;
// 后续随服务网格落地走 mTLS + 服务发现。
package sessionclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client session-svc 客户端。
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// New 构造客户端;baseURL 形如 http://session-svc:8081。
func New(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP: &http.Client{
			Timeout: 3 * time.Second,
		},
	}
}

// AppendRequest 与 session-svc AppendMessageRequest 一致。
type AppendRequest struct {
	ClientMsgID string                 `json:"clientMsgId,omitempty"`
	Role        string                 `json:"role,omitempty"`
	Type        string                 `json:"type"`
	Content     map[string]interface{} `json:"content,omitempty"`
	AIMeta      map[string]interface{} `json:"aiMeta,omitempty"`
}

// Message 与 session-svc Message 一致(只取 gateway 关心的字段)。
type Message struct {
	ID          string                 `json:"id"`
	SessionID   string                 `json:"sessionId"`
	Seq         int64                  `json:"seq"`
	ClientMsgID string                 `json:"clientMsgId,omitempty"`
	Role        string                 `json:"role"`
	Type        string                 `json:"type"`
	Content     map[string]interface{} `json:"content,omitempty"`
	Status      string                 `json:"status,omitempty"`
	CreatedAt   string                 `json:"createdAt,omitempty"`
}

// AppendMessage 写入一条消息。Idempotency-Key 由 ClientMsgID 替代。
func (c *Client) AppendMessage(ctx context.Context, sessionID string, req AppendRequest) (*Message, error) {
	if sessionID == "" {
		return nil, errors.New("sessionclient: empty sessionID")
	}
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/v1/sessions/%s/messages", c.BaseURL, sessionID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if req.ClientMsgID != "" {
		httpReq.Header.Set("Idempotency-Key", req.ClientMsgID)
	}
	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("sessionclient: append %d: %s", resp.StatusCode, string(respBody))
	}
	var m Message
	if err := json.Unmarshal(respBody, &m); err != nil {
		return nil, fmt.Errorf("sessionclient: decode resp: %w", err)
	}
	return &m, nil
}

// Health 简单 ping(actuator)。
func (c *Client) Health(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/actuator/health", nil)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("session-svc unhealthy: %d", resp.StatusCode)
	}
	return nil
}
