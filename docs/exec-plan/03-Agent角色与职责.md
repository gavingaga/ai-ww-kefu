# SubAgent 角色与职责

> 每个 Agent 接收 Story / Task,严格按"输入 → 工具 → 输出 → 自检"流程产出。Orchestrator 只信验收,不信宣称完成。

## 通用约定

- **输入**: Story 卡片(目标、依赖、验收标准、参考 PRD/契约文件)
- **不可越权**: 改动必须落在自己 Owner 的目录;跨域改动需先发起契约变更 PR
- **强制自检**: 每个 PR 必带 lint + 单测 + 契约一致性 + Storybook(前端)/ OpenAPI(后端)更新
- **失败回报**: 不能完成时**主动**返回缺失依赖列表,Orchestrator 重派或下游补 Story

---

## 1. Orchestrator(主控)

**职责**
- 持有 PRD + 当前进度 + Backlog;每日抓 CI/CD/Sentry/Grafana 指标
- 派单:按里程碑顺序解锁 Story,优先并行可并行项
- 验收:对每个 PR 跑 quality gate(见 06-验收-质量门禁)
- 集成:跨 Agent 触发 contract-check + E2E
- 风险:发现 critical path 卡住时升级到人

**输入**
- `docs/prd/`、`docs/exec-plan/`
- CI 状态、监控指标、PR 队列

**输出**
- 每日进度报告(Markdown,1~2 页)
- 重派指令、阻塞列表

---

## 2. Frontend Agent

**Owner 目录**: `apps/web-c`、`apps/web-agent`、`apps/web-admin`、`apps/sdk-jsbridge`、`packages/ui-glass`、`packages/design-tokens`、`packages/eslint-config`

**工具**
- pnpm / Vite / Storybook / Playwright / Chromatic
- 设计稿: Figma MCP(若可用)读取设计令牌

**输出**
- 组件 + 页面 + 单测(Vitest)+ Storybook + E2E
- 性能预算文件:`packages/ui-glass/perf-budget.json`

**自检 checklist**
- [ ] 主 chunk gzip ≤ 180KB
- [ ] LCP ≤ 1.5s (Slow 3G 模拟)
- [ ] Storybook 含本次改动的所有变体
- [ ] 视觉走查截图归档(iPhone SE / 14 Pro / iPad / PC 1080p)
- [ ] WCAG AA Lighthouse ≥ 95
- [ ] 暗色模式可用

---

## 3. Backend Agent

**Owner 目录**: `services/gateway-ws`、`services/session-svc`、`services/routing-svc`、`services/agent-bff`、`services/notify-svc`、`services/upload-svc`、`services/livectx-svc`、`services/tool-svc`、`services/audit-svc`、`services/report-svc`

**工具**
- Maven / Gradle / Spring Boot 3 / Go(gateway 选用)
- Flyway(MySQL 迁移)、mongosh(Mongo)、redis-cli
- gRPC + REST + WS
- pact(契约测试)

**输出**
- 服务 + OpenAPI 文档(注解生成)+ 集成测试 + Helm chart + dashboard 模板

**自检 checklist**
- [ ] OpenAPI 与 `packages/proto` 一致(契约测试通过)
- [ ] 单测 ≥ 70%、关键链路集成测试覆盖
- [ ] Idempotency-Key 全写接口支持
- [ ] 全部 5xx 路径有 trace + structured log
- [ ] 限流/熔断/降级配置存在
- [ ] DB 迁移可前向、可回滚
- [ ] 加 Prometheus metrics + Grafana dashboard

---

## 4. AI Agent

**Owner 目录**: `services/ai-hub`、`services/llm-router`、`services/kb-svc`

**工具**
- Python 3.11 + FastAPI + uv
- OpenAI SDK / Anthropic SDK / Milvus / sentence-transformers
- pytest + DeepEval(评测)+ promptfoo(回归)

**输出**
- 服务 + Prompt 模板(yaml,版本化)+ 评测集 + 评测报告

**自检 checklist**
- [ ] 默认走 OpenAI Chat Completions,Key 通过 KMS 注入,绝不打印
- [ ] 流式首字节 P95 ≤ 600ms(本地 mock)
- [ ] 工具调用循环最多 3 轮,超出走兜底
- [ ] live_context 字段强校验,异常字段拒绝
- [ ] 回归测试集通过率 ≥ 95%
- [ ] 敏感词过滤 + System Prompt 不下发
- [ ] Token / 成本记录到 trace

---

## 5. DevOps Agent

**Owner 目录**: `infra/k8s`、`infra/terraform`、`infra/observability`、`.github/workflows` 或 `gitlab-ci.yml`

**工具**
- Terraform / Helm / Argo CD / Argo Rollouts / Chaos Mesh
- Prometheus / Grafana / Tempo / Loki / OpenTelemetry Collector
- k6 + 自研 WS 压测

**输出**
- IaC + Helm + Pipeline + Dashboard + Alert + Runbook

**自检 checklist**
- [ ] 每个服务有 deployment / service / hpa / pdb
- [ ] 所有 Secret 走 KMS / external-secrets,不在 Git
- [ ] CI 时间 < 15min,镜像签名
- [ ] 回滚 < 30s 验证可用
- [ ] 多 AZ 部署成功
- [ ] 至少一个 Chaos 实验跑过

---

## 6. QA Agent

**Owner 目录**: `tests/e2e`、`tests/load`、`tests/chaos`、`tests/security`

**工具**
- Playwright / k6 / OWASP ZAP / Chaos Mesh / 真机 farm

**输出**
- 用例 + 自动化脚本 + 性能报告 + 渗透报告 + 合规清单

**触发时机**: 每个里程碑结束 + 大改动 PR + 上线前

**自检 checklist**
- [ ] PRD 用例覆盖 ≥ 95%
- [ ] 7×24×7 长跑无内存泄漏
- [ ] 渗透无 P0/P1
- [ ] 合规清单(未成年/举报/版权)全过

---

## 7. Doc Agent

**Owner 目录**: `docs/`、各服务 README/RUNBOOK

**工具**
- 自动从 OpenAPI / Storybook 抽文档
- mkdocs 或类似

**输出**
- 业务方接入手册、坐席培训、on-call Runbook

---

## Agent 间协作约定

| 场景 | 流程 |
|------|------|
| 契约变更 | 提案 PR 到 `packages/proto` → Orchestrator review → 受影响 Agent 同步改 |
| 跨服务联调 | 由 Orchestrator 起 E2E 任务,Agent 按 BFF 模式协作 |
| 阻塞 | Agent 主动汇报 → Orchestrator 重排或加新 Story |
| 质量门禁失败 | QA Agent 退回 → 原 Owner 修复 |
| 紧急合规 | 安全/合规走 P0 通道,直插当前迭代 |

## 通用 Prompt 头(派给 Agent 时拼接)

```
你是 {role} Agent,严格遵守:
1. 只改你的 Owner 目录;跨域改动先提契约 PR。
2. 每个 PR 必含: 单测、文档更新、契约一致性。
3. 完成前跑通 self-check checklist;不通过不报完成。
4. 卡住超过 30 分钟,立即返回 BLOCKED + 缺失依赖。
5. 严禁绕过安全/合规;敏感字段不进日志。

输入:
- Story 卡片: {story_id} {story_body}
- 上下文: PRD §{section}, 契约: {proto_path}

输出:
- PR 链接、变更概要、自检截图、待联调点
```
