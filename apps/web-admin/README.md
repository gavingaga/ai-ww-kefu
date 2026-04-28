# apps/web-admin

客服系统管理后台 — Vite + React + Tailwind,聚合 agent-bff `/v1/admin/*` 透传到下游服务。

## 当前能力(MVP)

- **运营看板**:KPI 卡(队列总数 / VIP / 未成年 / 超时 / 最长等待 / 坐席状态分布 /
  负载比 / 主管 / 策略)+ 按技能组分布 + 坐席表 + 排队表;5 秒自动刷新。
  对应 `GET /v1/admin/dashboard` → routing-svc `GET /v1/dashboard`。
- **KB 检索调试**:输入 query 与 vector_top / bm25_top / rrf_k / rerank_top 等参数,
  实时看到向量召回、BM25 召回、RRF 融合、Rerank 综合分,以及最终回 ai-hub 的 hits。
  对应后端 `POST /v1/admin/kb/debug/search` → kb-svc `POST /v1/kb/debug/search`。
- **KB 入库**:表单提交文档(id / kb_id / title / body / metadata) →
  `POST /v1/admin/kb/ingest`。本地缓存最近 20 条入库流水。
- **FAQ 节点管理**:列出所有 scene / 树 / 节点,可编辑 title / synonyms /
  answer.contentMd,整树覆盖式 `PUT /v1/admin/faq/trees`;附 query 命中模拟器
  `POST /v1/admin/faq/preview`。

## 开发

```bash
# 依赖 agent-bff(默认 :8084),agent-bff 配置 KB_SVC_URL 指向 kb-svc(默认 :8092)
pnpm --filter @ai-kefu/web-admin dev
# 浏览器打开 http://localhost:5175
```

> 端口 5175;通过 vite proxy 把 `/v1/admin/*` 转发到 agent-bff。

## 后续

- 知识库管理(列表 / 入库 / 删除 / 重嵌入)
- FAQ 节点管理(新建 / 编辑 / 命中统计)
- 主管 / 运营看板(队列、坐席负载)
- M3 末加 JWT + 角色 (ADMIN / SUPERVISOR) 鉴权
