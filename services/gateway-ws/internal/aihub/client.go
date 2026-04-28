// Package aihub 是 gateway-ws → ai-hub 的 SSE 客户端。
//
// ai-hub 协议:POST /v1/ai/infer 返回 text/event-stream,事件以 JSON dict 编码,字段
// `event` 区分 decision/token/handoff/done/error;详见 services/ai-hub/README.md。
package aihub

import (
	"bufio"
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

// Client ai-hub 客户端。
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// New 构造。
func New(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP: &http.Client{
			Timeout: 120 * time.Second, // SSE 流式,通过 ctx 控制
		},
	}
}

// InferRequest /v1/ai/infer 入参(只暴露 gateway 用得到的字段)。
type InferRequest struct {
	SessionID   string                 `json:"session_id"`
	UserText    string                 `json:"user_text"`
	History     []map[string]string    `json:"history,omitempty"`
	Profile     map[string]interface{} `json:"profile,omitempty"`
	LiveContext map[string]interface{} `json:"live_context,omitempty"`
	Summary     string                 `json:"summary,omitempty"`
	ProfileID   string                 `json:"profile_id,omitempty"`
	Stream      bool                   `json:"stream"`
}

// Event ai-hub 推出的单个事件。
type Event struct {
	Event      string                 `json:"event"`
	Action     string                 `json:"action,omitempty"`
	Reason     string                 `json:"reason,omitempty"`
	Confidence float64                `json:"confidence,omitempty"`
	Hits       []string               `json:"hits,omitempty"`
	Summary    string                 `json:"summary,omitempty"`
	Text       string                 `json:"text,omitempty"`
	Message    string                 `json:"message,omitempty"`
	TokensOut  int                    `json:"tokens_out,omitempty"`

	// FAQ 通道字段(event="faq" 时填充)
	NodeID string                 `json:"node_id,omitempty"`
	Title  string                 `json:"title,omitempty"`
	Answer map[string]interface{} `json:"answer,omitempty"`
	Score  float64                `json:"score,omitempty"`
	How    string                 `json:"how,omitempty"`

	Raw map[string]interface{} `json:"-"`
}

// InferStream 调 /v1/ai/infer,把 SSE 解析为 Event,通过 callback 回调。
//
// callback 返回 error 终止流(并主动断开 HTTP body)。
func (c *Client) InferStream(
	ctx context.Context,
	req InferRequest,
	cb func(Event) error,
) error {
	if cb == nil {
		return errors.New("aihub: nil callback")
	}
	body, err := json.Marshal(req)
	if err != nil {
		return err
	}
	httpReq, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.BaseURL+"/v1/ai/infer", bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("aihub: %d %s", resp.StatusCode, string(buf))
	}
	br := bufio.NewReaderSize(resp.Body, 4096)
	for {
		line, err := br.ReadBytes('\n')
		if len(line) == 0 && err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		line = bytes.TrimRight(line, "\r\n")
		if len(line) == 0 {
			continue
		}
		if !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		payload := bytes.TrimSpace(line[5:])
		if len(payload) == 0 {
			continue
		}
		var ev Event
		if jerr := json.Unmarshal(payload, &ev); jerr != nil {
			// 不可解析则跳过
			continue
		}
		_ = json.Unmarshal(payload, &ev.Raw)
		if cberr := cb(ev); cberr != nil {
			return cberr
		}
		if err != nil { // 上一次 ReadBytes 已经 EOF
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}
