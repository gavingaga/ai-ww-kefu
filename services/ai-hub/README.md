# ai-hub

ai-kefu AI 中枢:决策器(FAQ → 工具 → RAG → LLM → 兜底 / 转人工)+ Prompt 编排 + 流式输出。

## M2 起步状态

- 决策器接 **HANDOFF → FAQ → LLM** 三条路径
  - 关键词命中转人工(优先级最高,绕过 FAQ / LLM)
  - FAQ 命中(精确 / 相似)→ 直接返答案,**零 LLM Token**(T-213)
  - 否则走 LLM_GENERAL
- Prompt 编排已注入 `live_context` / `profile` / `summary`
- 输出协议:SSE 事件 `decision` / `token` / `faq` / `handoff` / `done` / `error`
- LLM 调用通过 `services/llm-router`(`X-Profile-Id` 选档)
- FAQ 调用通过 `services/notify-svc`(`/v1/faq/match` + `/v1/faq/hit` 命中埋点)

后续接入:
- T-209 Prompt 模板版本化 + 场景路由
- T-210 工具调用循环 + dry_run + 二次确认
- T-212 Handoff Packet 生成
- RAG / Tool 通道(T-208 完整版)

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/healthz` | 健康 |
| POST | `/v1/ai/infer` | SSE 流式推理 |

`/v1/ai/infer` 入参:

```jsonc
{
  "session_id": "ses_xxx",
  "user_text": "我看视频卡顿,怎么处理?",
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }],
  "profile": { "level": "VIP3", "uid": 100 },
  "live_context": { "scene": "live_room", "room_id": 8001, "play": { "quality": "1080p" } },
  "summary": "用户咨询直播卡顿",
  "tools": [],
  "profile_id": "openai_default",
  "stream": true
}
```

SSE 事件序列:

```
data: {"event":"decision","action":"llm_general","reason":"default","confidence":0.5,"hits":[]}
data: {"event":"token","text":"建"}
data: {"event":"token","text":"议你"}
...
data: {"event":"done","tokens_out":42}
```

或转人工分支:

```
data: {"event":"decision","action":"handoff","reason":"rule_keyword","hits":["投诉"]}
data: {"event":"handoff","reason":"rule_keyword","hits":["投诉"],"summary":"..."}
data: {"event":"done"}
```

## 配置

| Env | 说明 |
|-----|------|
| `LLM_ROUTER_URL` | 默认 `http://localhost:8090` |
| `NOTIFY_SVC_URL` | 默认 `http://localhost:8082`(FAQ 通道源) |
| `AI_HUB_PORT` | 默认 `8091` |
| `AI_HUB_HANDOFF_KEYWORDS` | 逗号分隔覆盖默认关键词集 |
| `AI_HUB_LLM_INLINE_MOCK` | `1` 时不调 llm-router,走内置 mock(单测/离线开发) |

## 开发

```bash
# 仓库根
uv sync --group dev
uv run --package ai-hub pytest services/ai-hub

# 起 ai-hub(假设 llm-router 已在 :8090)
LLM_ROUTER_URL=http://localhost:8090 uv run --package ai-hub python -m ai_hub.main
# /docs:http://localhost:8091/docs
```
