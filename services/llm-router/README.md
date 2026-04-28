# llm-router

ai-kefu 的 LLM 多供应商路由 — 以 OpenAI Chat Completions 为统一协议,屏蔽各家差异。

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/healthz` | 健康 |
| GET | `/v1/profiles` | 列出已配置档位(api_key 仅留后 4 位) |
| GET | `/v1/profiles/{pid}/health` | 健康分(成功率 / P95 / 上次错误) |
| POST | `/v1/profiles/{pid}/test` | 试聊(单轮、不流式) |
| POST | `/v1/chat/completions` | 透传 OpenAI 协议;Header `X-Profile-Id` 选档(默认 `openai_default`) |

## 配置

| Env | 说明 |
|-----|------|
| `OPENAI_API_KEY` | 默认档位 `openai_default` 用 |
| `OPENAI_BASE_URL` | 默认 `https://api.openai.com/v1` |
| `LLM_DEFAULT_MODEL` | 默认 `gpt-4o-mini` |
| `LLM_PROFILES_FILE` | 多档 JSON 文件路径(可选) |
| `LLM_MOCK` | `1` 时走内置 mock,不打外网 |
| `LLM_ROUTER_PORT` | 默认 `8090` |

`LLM_PROFILES_FILE` 示例:

```json
[
  { "id": "openai_default", "model": "gpt-4o-mini", "api_key": "sk-...", "tags": ["default"] },
  { "id": "complex", "model": "gpt-4o", "api_key": "sk-...", "fallback_id": "openai_default" },
  { "id": "deepseek", "provider": "openai_compatible", "base_url": "https://api.deepseek.com/v1", "api_key": "ds-...", "model": "deepseek-chat" }
]
```

## 开发

```bash
# 仓库根
uv sync --group dev
uv run --package llm-router pytest services/llm-router

LLM_MOCK=1 uv run --package llm-router python -m llm_router.main
# 浏览器:http://localhost:8090/docs
```

## 路由策略

- 沿 `fallback_id` 解出档位链,首档失败且未输出过任何 token,自动尝试下一档
- 已开始流式输出后失败 → 直接抛出,**绝不串话**(防止给客户端拼出错乱文本)
- 每次成功 / 失败都进 `HealthTracker`,可在 `/v1/profiles/{pid}/health` 看

## 后续

- T-202 多 provider 自动切档与权重路由(目前仅 fallback 链)
- T-203 RPM/TPM 限速(Redis 计数)
- T-204 KMS 加密 + AES-GCM 静态 + 启动时解密
- M2.5 嵌入与 Reranker 也走本服务(`/v1/embeddings`)
