// loadtest 是 gateway-ws 的简易并发压测工具。
//
// 用法示例:
//
//	go run ./services/gateway-ws/scripts/loadtest \
//	    -url ws://localhost:8080/v1/ws \
//	    -n 50000 -rate 1000 -dur 60s -interval 2s
//
// 行为:
//  - 按 -rate(每秒)节流连接,直到达到 -n
//  - 每个连接每 -interval 发一帧 msg.text,期望服务端任意回包(echo / AI)
//  - 持续 -dur,期间每 5s 输出一次 connected / in-flight / 平均 RTT / p99 RTT
//  - 退出时输出汇总:peak conn, total msg, error 计数,RTT 分位
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"sort"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	url := flag.String("url", "ws://localhost:8080/v1/ws", "gateway-ws WebSocket 入口")
	n := flag.Int("n", 1000, "目标并发连接数(峰值)")
	rate := flag.Int("rate", 200, "每秒新建连接数(节流避免握手风暴)")
	dur := flag.Duration("dur", 30*time.Second, "总运行时长")
	interval := flag.Duration("interval", 5*time.Second, "每个连接发送间隔")
	subProto := flag.String("subprotocol", "v1.aikefu", "Sec-WebSocket-Protocol")
	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	var (
		connected atomic.Int64
		errs      atomic.Int64
		sent      atomic.Int64
		recvd     atomic.Int64
		peak      atomic.Int64

		rttMu sync.Mutex
		rtts  = make([]time.Duration, 0, 128*1024)
	)

	pending := sync.Map{} // msgID → sentAt(time.Time)
	dialer := websocket.DefaultDialer
	header := map[string][]string{
		"Sec-WebSocket-Protocol": {*subProto},
	}

	startConn := func(idx int) {
		c, _, err := dialer.DialContext(ctx, *url, header)
		if err != nil {
			errs.Add(1)
			return
		}
		defer c.Close()
		connected.Add(1)
		now := connected.Load()
		for {
			old := peak.Load()
			if now <= old {
				break
			}
			if peak.CompareAndSwap(old, now) {
				break
			}
		}
		defer connected.Add(-1)

		sid := fmt.Sprintf("ses_lt_%d", idx)

		// 读循环 — 收到任意带 msg_id 的帧时计 RTT
		go func() {
			for {
				_, raw, err := c.ReadMessage()
				if err != nil {
					return
				}
				recvd.Add(1)
				var f struct {
					MsgID string `json:"msg_id"`
				}
				_ = json.Unmarshal(raw, &f)
				if f.MsgID != "" {
					if v, ok := pending.LoadAndDelete(f.MsgID); ok {
						rtt := time.Since(v.(time.Time))
						rttMu.Lock()
						rtts = append(rtts, rtt)
						rttMu.Unlock()
					}
				}
			}
		}()

		// 发送循环
		t := time.NewTicker(*interval)
		defer t.Stop()
		// 抖动 0~interval 避免雪崩
		time.Sleep(time.Duration(rand.Int63n(int64(*interval))))
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				mid := fmt.Sprintf("m_%d_%d", idx, time.Now().UnixNano())
				pending.Store(mid, time.Now())
				frame := map[string]any{
					"type":       "msg.text",
					"session_id": sid,
					"msg_id":     mid,
					"payload":    map[string]any{"text": "hello"},
				}
				if err := c.WriteJSON(frame); err != nil {
					errs.Add(1)
					return
				}
				sent.Add(1)
			}
		}
	}

	// 节流派单
	go func() {
		ticker := time.NewTicker(time.Second / time.Duration(*rate))
		defer ticker.Stop()
		for i := 0; i < *n; i++ {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				go startConn(i)
			}
		}
	}()

	// 进度报告
	report := time.NewTicker(5 * time.Second)
	defer report.Stop()
	deadline := time.After(*dur)
	for {
		select {
		case <-ctx.Done():
			summary(connected.Load(), peak.Load(), sent.Load(), recvd.Load(), errs.Load(), &rttMu, rtts)
			return
		case <-deadline:
			summary(connected.Load(), peak.Load(), sent.Load(), recvd.Load(), errs.Load(), &rttMu, rtts)
			return
		case <-report.C:
			fmt.Fprintf(
				os.Stderr,
				"[t+%s] connected=%d peak=%d sent=%d recvd=%d errs=%d rtt_avg=%s rtt_p99=%s\n",
				time.Now().Format("15:04:05"),
				connected.Load(), peak.Load(), sent.Load(), recvd.Load(), errs.Load(),
				avg(&rttMu, rtts), pct(&rttMu, rtts, 99),
			)
		}
	}
}

func summary(curConn, peak, sent, recvd, errs int64, mu *sync.Mutex, rtts []time.Duration) {
	log.Printf("=== summary ===")
	log.Printf("peak_connections=%d still_connected=%d", peak, curConn)
	log.Printf("sent=%d recvd=%d errors=%d", sent, recvd, errs)
	log.Printf("rtt avg=%s p50=%s p90=%s p99=%s",
		avg(mu, rtts), pct(mu, rtts, 50), pct(mu, rtts, 90), pct(mu, rtts, 99))
}

func avg(mu *sync.Mutex, rtts []time.Duration) time.Duration {
	mu.Lock()
	defer mu.Unlock()
	if len(rtts) == 0 {
		return 0
	}
	var sum time.Duration
	for _, r := range rtts {
		sum += r
	}
	return sum / time.Duration(len(rtts))
}

func pct(mu *sync.Mutex, rtts []time.Duration, p int) time.Duration {
	mu.Lock()
	defer mu.Unlock()
	n := len(rtts)
	if n == 0 {
		return 0
	}
	cp := make([]time.Duration, n)
	copy(cp, rtts)
	sort.Slice(cp, func(i, j int) bool { return cp[i] < cp[j] })
	idx := (n * p) / 100
	if idx >= n {
		idx = n - 1
	}
	return cp[idx]
}
