# services/tool-svc

业务工具中心 — ai-hub 工具循环的真实执行后端。

## 端点

```
GET  /v1/tools                                        列出全部工具
GET  /v1/tools/openai?names=a,b                       OpenAI tools 协议
POST /v1/tools/{name}/invoke  {args, ctx}             执行
GET  /v1/tools/healthz
```

`ctx`(可空):

```json
{
  "session_id": "ses_xxx",
  "uid": 12345,
  "dry_run": false,            // 写工具默认 true,显式传 false 才真执行
  "live_context": { ... },     // 可选,直接注入(否则工具自己拉 livectx-svc)
  "idempotency_key": "..."
}
```

## 内置工具(M3)

- `get_play_diagnostics`(读) — 基于 livectx-svc 合并后的 play / network 推断 verdict + summary
- `get_room_info` / `get_vod_info`(读)
- `get_membership` / `get_subscription_orders`(读)
- `cancel_subscription`(**写**,默认 dry_run)
- `report_content`(**写**,留痕)
- `get_anchor_info`(读)

## 端口

默认 `8087`;可通过 `TOOL_PORT` 覆盖。

## 兜底

- 单工具 `timeout_ms` 默认 3s,超时 cancel 并返回 `{ok:false, error:"timeout..."}`
- 异常被 `ToolExecutor` 兜底为 `{ok:false, error:"execution failed: ..."}`
- 未知工具返回 `{ok:false, error:"tool not registered"}`
- 每次调用 fire-and-forget 写 `audit-svc` 一条 `tool.invoke`。

