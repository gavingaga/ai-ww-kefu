# gateway-ws

ai-kefu 长连接网关。

## 职责

- 终止客户端 WebSocket(`/v1/ws`)
- 心跳:服务端按 PingPeriod 主动发 WS Ping;PongWait 内未收到关连接
- 帧解析与路由(`internal/router`)
- 内存 hub 维护 conn ↔ session 映射(M1 单进程;M1 末通过 Redis 跨节点 — T-102)
- HTTP 健康检查 `/healthz` `/readyz`,统计端点 `/metrics-lite`

## 构建与运行

```bash
cd services/gateway-ws
make test            # go test
make run             # 默认 :8080,/v1/ws

# 浏览器侧:
#   wss://host/v1/ws?uid=u_demo&session_id=ses_demo
```

环境变量:

| Key | 默认 | 说明 |
|-----|------|------|
| `GATEWAY_HTTP_ADDR` | `:8080` | 监听地址 |
| `GATEWAY_WS_PATH` | `/v1/ws` | WS 路径 |
| `GATEWAY_HB_INTERVAL` | `25s` | 心跳间隔 |
| `GATEWAY_HB_TIMEOUT` | `35s` | 心跳超时 |
| `GATEWAY_MAX_FRAME_BYTES` | `65536` | 单帧上限 |
| `GATEWAY_MAX_PENDING` | `1024` | 单连接发送队列上限 |
| `GATEWAY_ALLOWED_ORIGINS` | (空,放开) | 逗号分隔 Origin 白名单 |

## 接入 web-c(本地联调)

```bash
# 终端 1
make run

# 终端 2
VITE_WS_URL=ws://localhost:8080/v1/ws pnpm --filter @ai-kefu/web-c dev
# 浏览器打开 http://localhost:5173,发送消息可看到 Echo 流式回复
```

## 后续

| Ticket | 改动 |
|--------|------|
| T-102 | Redis 一致性 hash 路由 + 跨节点定向推送 |
| T-103 | 背压 / 限流 / 单节点 50k 连接压测 |
| M2 | 用 KafkaRouter 替换 EchoRouter,发到 chat.in,从 chat.out 拉服务端帧 |
