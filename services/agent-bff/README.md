# agent-bff

座席工作台 BFF — 给 web-agent 提供精简统一接口,聚合 routing-svc + session-svc(+ 后续 notify-svc / audit-svc)。

## REST(节选)

> 所有需要坐席身份的端点都通过 ``X-Agent-Id`` HTTP 头传入(M3 末换 JWT)。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/agent/healthz` | |
| POST | `/v1/agent/register` | 注册或更新坐席档案 |
| POST | `/v1/agent/status` | 状态切换 (`OFFLINE/IDLE/BUSY/AWAY`) |
| GET | `/v1/agent/inbox` | 收件箱(等待 + 进行中) |
| POST | `/v1/agent/peek` | 取一条派单候选(不抢占) |
| POST | `/v1/agent/sessions/accept` | 接受派单(`{ entry_id }`) |
| POST | `/v1/agent/sessions/{id}/close` | 结束 |
| POST | `/v1/agent/sessions/{id}/transfer` | 转回 AI 托管 |
| GET | `/v1/agent/sessions/{id}/messages` | 历史(代理 session-svc) |
| POST | `/v1/agent/sessions/{id}/messages` | 坐席发消息(自动 role=agent) |

## 配置

| Env / Prop | 默认 | 说明 |
|------------|------|------|
| `AGENT_BFF_PORT` | `8084` | |
| `aikefu.routing-svc.url` | `http://localhost:8083` | |
| `aikefu.session-svc.url` | `http://localhost:8081` | |
| `GATEWAY_WS_URL` | (空) | 配置后坐席回复 / 主管插话会同步推到 gateway-ws 的 `/internal/push`,实时到达 C 端 |
| `GATEWAY_INTERNAL_PUSH_TOKEN` | (空) | gateway-ws 端校验的共享 token(留空表示放开) |

## 后续

- T-302 主管干预端点(监听 / 插话 / 抢接)
- 接 notify-svc 的快捷短语
- 接 livectx-svc 的播放诊断数据
- WebSocket 推送给 web-agent(目前 web-agent 走 polling 简化版)
