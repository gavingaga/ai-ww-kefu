# notify-svc

公告 / 快捷按钮 / 多级常见问题(FAQ) + 推送。Spring Boot 3 / Java 21。

## M2 起步:FAQ 通道(T-213)

- 多级树:`FaqTree` → `FaqNode`(分类 / 叶子);叶子带 `FaqAnswer`(content_md / attachments / follow_ups / actions)
- 同义问 + 精确匹配 + token-overlap 相似匹配(无嵌入服务时的兜底)
- 启动时从 `classpath:seeds/faq-default.json` 装载直播 / 点播领域默认 FAQ(welcome 场景)
- M1 内存仓储,M2 后接 MySQL `faq_tree` / `faq_node` 表

> 真正的相似匹配走嵌入向量(详见 PRD 03 §2.3),由 ai-hub 调 llm-router `/v1/embeddings` 做。
> 本服务保留 `aikefu.faq.similarity-threshold=0.86` 配置项给嵌入侧使用,
> token-overlap 仅作为没有嵌入服务时的"零依赖兜底"。

## REST(节选)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/faq/tree?scene=welcome` | 拉取整棵树 |
| GET | `/v1/faq/node/{id}/children` | 懒加载子节点 |
| POST | `/v1/faq/match` | `{ query }` → `{ hit, how, score, node_id?, title?, answer? }` |
| POST | `/v1/faq/hit` | `{ node_id }` 上报点击命中 |
| GET | `/admin/v1/faq/trees` | 列出全部 |
| PUT | `/admin/v1/faq/trees` | 整树覆盖,自动 +1 版本 |
| POST | `/admin/v1/faq/preview` | 模拟器 |
| GET | `/admin/v1/faq/hits/{nodeId}` | 命中累计 |

## 配置

| Env / Prop | 默认 | 说明 |
|------------|------|------|
| `NOTIFY_SVC_PORT` | `8082` | |
| `aikefu.faq.seed-resource` | `seeds/faq-default.json` | 种子文件 classpath 路径 |
| `aikefu.faq.similarity-threshold` | `0.86` | 嵌入向量阈值(供 ai-hub 用) |
| `aikefu.faq.overlap-threshold` | `0.55` | token-overlap 兜底阈值 |

## 运行

```bash
mvn -pl services/notify-svc -am test
mvn -pl services/notify-svc -am spring-boot:run
# /docs(Springdoc 待接) — 暂用 curl 自测:
curl 'http://localhost:8082/v1/faq/tree?scene=welcome'
curl -X POST -H 'content-type: application/json' \
  -d '{"query":"视频好卡"}' \
  http://localhost:8082/v1/faq/match
```

## 后续

- T-107 公告 + 快捷按钮(数据 + 推送通道)
- T-214 admin 拖拽节点级 CRUD + 灰度 + 数据面
- M2.5 配合 ai-hub 接嵌入侧的"相似匹配"(向量 + 阈值)
