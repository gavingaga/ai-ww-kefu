// Package config 提供服务运行时配置(从环境变量装载,带默认值)。
package config

import (
	"os"
	"strconv"
	"time"
)

// Config 长连接网关运行时配置。
type Config struct {
	HTTPAddr             string
	WSPath               string
	HealthPath           string
	ReadyPath            string
	HeartbeatInterval    time.Duration // server → client ping 间隔
	HeartbeatTimeout     time.Duration // 收不到任何客户端帧的最大时间
	MaxFrameBytes        int64         // 单帧最大字节
	MaxPendingPerConn    int           // 单连接发送队列上限
	AllowedOrigins       []string      // CORS / WS Origin 白名单;空表示放开
	WriteWait            time.Duration
	PongWait             time.Duration
	PingPeriod           time.Duration
	IdleSessionTimeoutS  int
	GracefulShutdownTime time.Duration
}

// Load 从环境变量读取配置。
func Load() Config {
	return Config{
		HTTPAddr:             envStr("GATEWAY_HTTP_ADDR", ":8080"),
		WSPath:               envStr("GATEWAY_WS_PATH", "/v1/ws"),
		HealthPath:           "/healthz",
		ReadyPath:            "/readyz",
		HeartbeatInterval:    envDur("GATEWAY_HB_INTERVAL", 25*time.Second),
		HeartbeatTimeout:     envDur("GATEWAY_HB_TIMEOUT", 35*time.Second),
		MaxFrameBytes:        int64(envInt("GATEWAY_MAX_FRAME_BYTES", 64*1024)),
		MaxPendingPerConn:    envInt("GATEWAY_MAX_PENDING", 1024),
		AllowedOrigins:       envList("GATEWAY_ALLOWED_ORIGINS"),
		WriteWait:            10 * time.Second,
		PongWait:             60 * time.Second,
		PingPeriod:           54 * time.Second,
		IdleSessionTimeoutS:  envInt("GATEWAY_IDLE_TIMEOUT_S", 600),
		GracefulShutdownTime: 15 * time.Second,
	}
}

func envStr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envDur(k string, def time.Duration) time.Duration {
	if v := os.Getenv(k); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func envList(k string) []string {
	v := os.Getenv(k)
	if v == "" {
		return nil
	}
	out := []string{}
	cur := ""
	for _, r := range v {
		if r == ',' {
			if cur != "" {
				out = append(out, cur)
				cur = ""
			}
		} else {
			cur += string(r)
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
