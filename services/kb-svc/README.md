# kb-svc

知识库服务 — 切片 / 嵌入 / Hybrid 检索(向量 + BM25 + RRF + Reranker)。

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/healthz` | |
| GET | `/v1/kb/stats` | chunk 统计 |
| POST | `/v1/kb/ingest` | 写入文档 → 切片 + 嵌入 + 入库 |
| POST | `/v1/kb/search` | Hybrid 检索 + 详细分数(调试) |
| POST | `/v1/kb/match` | 简化 RAG 接口 — 已拼好 `rendered` 给 ai-hub |

## 检索流水线

详见 PRD `03-AI 中枢-需求.md` §2.4:

1. 嵌入查询 → 向量召回 top 50
2. BM25 召回 top 50(可与 kb_id 过滤)
3. **RRF**(Reciprocal Rank Fusion,k=60)融合两路
4. 词重叠 reranker 取 top_k(默认 5);最终分 = 0.6·RRF + 0.4·重排

> Reranker 只是 M2 起步占位;真生产换 BGE-Reranker(留接口)。

## 嵌入器

| `KB_EMBED_PROVIDER` | 说明 |
|---------------------|------|
| `hash`(默认) | 本地 SHA1 散列嵌入(384 维),用于离线开发与单测 |
| `llm` | 通过 `services/llm-router` 调真嵌入(`POST /v1/embeddings`) |

## 配置

| Env | 默认 | 说明 |
|-----|------|------|
| `KB_SVC_PORT` | `8092` | |
| `KB_AUTO_SEED` | `1` | 启动时自动加载 `seeds/seed_default.json`(7 篇直播领域 KB) |
| `KB_EMBED_PROVIDER` | `hash` | `hash` / `llm` |
| `KB_EMBED_MODEL` | `text-embedding-3-large` | 仅 `provider=llm` 用 |
| `KB_EMBED_DIM` | `3072` | 仅 `provider=llm` 用 |
| `LLM_ROUTER_URL` | `http://localhost:8090` | 仅 `provider=llm` 用 |

## 默认种子

包含直播 / 点播领域 7 篇标准答复:
- 清晰度档位与码率
- 卡顿排查标准答复
- 会员订阅与连续包月
- **未成年人误充值退款流程**
- UGC 举报处置时效
- 主播分成与提现规则
- 节目下架的常见原因

## 开发

```bash
uv sync --group dev
uv run --package kb-svc pytest services/kb-svc

# 起服务
uv run --package kb-svc python -m kb_svc.main
# 试一个查询:
curl -X POST -H 'content-type: application/json' \
  -d '{"query":"视频卡顿怎么办","top_k":3}' \
  http://localhost:8092/v1/kb/match
```
