package router

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ai-kefu/gateway-ws/internal/agentbff"
	"github.com/ai-kefu/gateway-ws/internal/aihub"
	"github.com/ai-kefu/gateway-ws/internal/sessionclient"
)

// fakeConn 实现 wsconn.SendFrame 的最小所需(只用 SendFrame),
// 因 streamReply 通过 conn.SendFrame 推回前端 — 单测里我们用 nil conn 会 panic;
// 这里跳过对 conn 的依赖,直接构造 *wsconn.Conn 不可能,因此本测试仅覆盖
// "聚合 + 入库 + 反向通知"这条数据路径,通过让 streamReply 在子协程结束前等待。

type appendCapture struct {
	mu  sync.Mutex
	got []sessionclient.AppendRequest
	mid map[string]string // sid+role+cmid → msg_id
}

func (c *appendCapture) snapshot() []sessionclient.AppendRequest {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]sessionclient.AppendRequest, len(c.got))
	copy(out, c.got)
	return out
}

func sseHandler(events []string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		for _, e := range events {
			fmt.Fprintf(w, "data: %s\n\n", e)
			if flusher != nil {
				flusher.Flush()
			}
		}
	}
}

// 通过覆盖 wsconn.Router 的最小调用面来跳过 wsconn.Conn 依赖:把 streamReply 抽成 helper.
// 这里直接调用 r.streamReply 的内部行为不可行(需 *wsconn.Conn);
// 因此走端到端 — 但在测试里只关心入库 + bff 调用,所以让 stream 不向 conn 发任何帧
// 的方式:跳过 conn.SendFrame(用 nil conn 会 panic)。改为只测 persistAndNotify 路径。
//
// 简化策略:直接用 r.persistAIText / persistFAQ 等"包私有"方法做单测。

func TestAIPersistTextWritesAndNotifies(t *testing.T) {
	cap := &appendCapture{mid: map[string]string{}}
	sessSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req sessionclient.AppendRequest
		_ = json.Unmarshal(body, &req)
		cap.mu.Lock()
		cap.got = append(cap.got, req)
		cap.mu.Unlock()
		_ = json.NewEncoder(w).Encode(sessionclient.Message{
			ID: "msg_" + req.Role, SessionID: "ses_t", Seq: 1,
			ClientMsgID: req.ClientMsgID, Role: req.Role, Type: req.Type,
		})
	}))
	defer sessSrv.Close()

	notified := make(chan string, 4)
	bffSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		notified <- string(body)
		w.WriteHeader(200)
	}))
	defer bffSrv.Close()

	ai := NewAI(
		aihub.New("http://no-where"),
		sessionclient.New(sessSrv.URL),
		agentbff.New(bffSrv.URL, ""),
		nil,
	)
	ragChunks := []map[string]interface{}{
		{
			"chunk_id": "kbA-3",
			"doc_id":   "doc-buffer",
			"title":    "卡顿排查标准答复",
			"content":  "建议切到 480p / 关闭硬件加速 / 切节点。",
			"score":    0.78,
		},
		{
			"chunk_id": "kbA-7",
			"title":    "网络诊断",
			"content":  "ping live-cdn.example.com 检查丢包。",
			"score":    0.62,
		},
	}
	toolCalls := []map[string]interface{}{
		{"name": "diagnose_stream", "ok": true, "result": map[string]interface{}{"rtt_ms": 280}},
	}
	ai.persistAIText(
		context.Background(),
		"ses_t", "u_1",
		"建议切到 480p 试试",
		"llm_general", "default",
		"卡顿排查标准答复", 0.78,
		ragChunks,
		toolCalls,
	)

	// persistAndNotify 异步,等一会
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if len(cap.snapshot()) > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	got := cap.snapshot()
	if len(got) != 1 {
		t.Fatalf("expected 1 append, got %d", len(got))
	}
	req := got[0]
	if req.Role != "ai" || req.Type != "text" {
		t.Fatalf("role/type wrong: %+v", req)
	}
	if req.Content == nil || req.Content["text"] != "建议切到 480p 试试" {
		t.Fatalf("text mismatch: %+v", req.Content)
	}
	if req.AIMeta["rag_top_title"] != "卡顿排查标准答复" {
		t.Fatalf("rag meta missing: %+v", req.AIMeta)
	}
	if chunks, ok := req.AIMeta["rag_chunks"].([]interface{}); !ok || len(chunks) != 2 {
		// JSON 反序列化后切片元素是 interface{} — 取第一个验证
		raw, _ := json.Marshal(req.AIMeta["rag_chunks"])
		if !strings.Contains(string(raw), "卡顿排查标准答复") || !strings.Contains(string(raw), "kbA-7") {
			t.Fatalf("rag_chunks missing or malformed: %s", raw)
		}
	}
	if calls, ok := req.AIMeta["tool_calls"].([]interface{}); !ok || len(calls) != 1 {
		raw, _ := json.Marshal(req.AIMeta["tool_calls"])
		if !strings.Contains(string(raw), "diagnose_stream") {
			t.Fatalf("tool_calls missing: %s", raw)
		}
	}

	select {
	case body := <-notified:
		if !strings.Contains(body, "ses_t") || !strings.Contains(body, "msg_ai") {
			t.Fatalf("notify body bad: %s", body)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting bff notify")
	}
}

func TestAIPersistFAQWritesAsFaqType(t *testing.T) {
	cap := &appendCapture{mid: map[string]string{}}
	sessSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req sessionclient.AppendRequest
		_ = json.Unmarshal(body, &req)
		cap.mu.Lock()
		cap.got = append(cap.got, req)
		cap.mu.Unlock()
		_ = json.NewEncoder(w).Encode(sessionclient.Message{
			ID: "msg_faq", SessionID: "ses_t", Seq: 1, ClientMsgID: req.ClientMsgID,
			Role: req.Role, Type: req.Type,
		})
	}))
	defer sessSrv.Close()

	ai := NewAI(aihub.New("http://no-where"), sessionclient.New(sessSrv.URL), nil, nil)
	ai.persistFAQ(context.Background(), "ses_t", aihub.Event{
		Event: "faq",
		NodeID: "play.buffer",
		Title:  "我看视频卡顿怎么办?",
		Answer: map[string]interface{}{"contentMd": "切到 480p 试试"},
		How:    "exact",
		Score:  1.0,
	})

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if len(cap.snapshot()) > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	got := cap.snapshot()
	if len(got) != 1 || got[0].Type != "faq" || got[0].Role != "ai" {
		t.Fatalf("bad faq append: %+v", got)
	}
	if got[0].Content["node_id"] != "play.buffer" {
		t.Fatalf("missing node_id: %+v", got[0].Content)
	}
}

