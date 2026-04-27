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
| `SESSION_SVC_URL` | (空) | 接入 session-svc 写入消息 |
| `GATEWAY_REGISTRY` | `noop` | `noop` / `mem` / `redis` |
| `GATEWAY_NODE_ID` | `hostname` | 跨节点 Registry 中本节点的 ID |
| `REDIS_ADDR` | (空) | `redis:6379`,需 `-tags redis` 编译 |

## 接入 web-c(本地联调)

```bash
# 终端 1
make run

# 终端 2
VITE_WS_URL=ws://localhost:8080/v1/ws pnpm --filter @ai-kefu/web-c dev
# 浏览器打开 http://localhost:5173,发送消息可看到 Echo 流式回复
```

## 跨节点路由(T-102)

`internal/registry`:`Registry` 接口 + 三种实现

- `Noop`(默认,单进程):Lookup 直接返回 ErrNotFound
- `Mem`:进程内 ↔ Hub 之间共享,用于单测 / 同进程模拟集群
- `Redis`:`go build -tags redis ./...` 启用,用 `kefu:gw:bind:<sid>` 做绑定 + `kefu:gw:node:<node>` 做 Pub/Sub

`internal/dispatch.Dispatcher` 把"本地直推 + 跨节点 Lookup+Publish"封装成一个入口:

1. 升级 WS 时自动 `Bind(sessionID → 本节点)`,断开时 `Unbind`
2. 周期(TTL/3)续约本节点上仍活跃的 session
3. 订阅自身 channel,收到跨节点 payload 时回写本地 hub.PushSession

```bash
# 进程内演示
GATEWAY_REGISTRY=mem GATEWAY_NODE_ID=gw-1 make run

# 生产
make build-redis
GATEWAY_REGISTRY=redis REDIS_ADDR=redis:6379 \
  GATEWAY_NODE_ID=gw-prod-a ./bin/gateway-ws
```

## 后续

| Ticket | 改动 |
|--------|------|
| T-103 | 背压 / 限流 / 单节点 50k 连接压测 |
| M2 | 用 ai-hub 流式 Router 替换 EchoRouter,发到 chat.in,从 chat.out 拉服务端帧 |
