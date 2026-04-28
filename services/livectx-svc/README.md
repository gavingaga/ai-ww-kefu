# services/livectx-svc

直播 / 点播业务上下文服务。承载两条职责:

1. **SDK 上报缓存** — 客户端把当前直播间播放快照(`play`、`network`、`device`)
   周期上报,内存 LRU + TTL(默认 120s)。
2. **服务端权威拼合** — `anchor_id` / `program_title` / `play.cdn_node` /
   `play.drm` / `user.level` / `user.is_minor_guard` 等字段一律由服务端反查
   覆盖,避免 H5 / JSBridge 被篡改导致 AI 决策被诱导。

## 端点

```
GET  /v1/live/healthz                                  健康检查
POST /v1/live/context     {LiveContext JSON}           SDK 上报
GET  /v1/live/context?scene=&room_id=&vod_id=&uid=     拉合并后的 LiveContext
```

返回结构遵循 `packages/proto/live-context/live-context.schema.json`。

## 端口

默认 `8086`;通过 `LIVECTX_PORT` 覆盖。
