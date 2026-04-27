# Backlog · Epic / Story 拆分

> 派发单位: **Story**(2~5 人天为宜)。每个 Story 都带依赖、Owner、估时、验收标准。可由 SubAgent 直接领取执行。

## 命名

- ID: `EPIC-<域>-<编号>` / `STORY-<域>-<编号>`
- 域: FE / BE / AI / OPS / QA / DOC

---

## EPIC-FE-1 · C 端 Web H5

| Story | 描述 | 估时 | 依赖 | DoD |
|-------|------|------|------|------|
| STORY-FE-1.1 | 工程脚手架(Vite + TS + Tailwind + Zustand + TanStack Query) | 1d | M0-1 | `pnpm dev` 跑起来 |
| STORY-FE-1.2 | 设计令牌 + 玻璃材质组件库(Glass / Bubble / Avatar / Capsule) | 3d | M0-2 | Storybook 含 8 组件 |
| STORY-FE-1.3 | WebSocket reconnecting wrapper(seq+ack+pull) | 2d | proto v0.1 | 单测覆盖断网/重连/丢包 |
| STORY-FE-1.4 | 消息流(虚拟列表 + 三种气泡 + 状态指示) | 3d | 1.2/1.3 | 1000 条 60fps |
| STORY-FE-1.5 | 输入区(胶囊 + 多行 + 附件 + Enter/Shift) | 2d | 1.2 | IME 友好 |
| STORY-FE-1.6 | 公告跑马灯(多条/critical/链接/24h 关闭) | 2d | API | rAF 实现 |
| STORY-FE-1.7 | 快捷按钮区 | 1d | API | 灰度生效 |
| STORY-FE-1.8 | 多级 FAQ 卡片(下钻/面包屑/动作按钮) | 3d | API | 与后端联调 |
| STORY-FE-1.9 | 直播间快照卡片 | 1d | API | 自动展示 |
| STORY-FE-1.10 | 播放诊断卡片 + 一键上报入口 | 3d | M2.5-4 | 真机演示 |
| STORY-FE-1.11 | 会员订阅卡片 + 表单卡片 | 2d | tool-svc | 二次确认完整 |
| STORY-FE-1.12 | 形态适配:悬浮/抽屉/全屏/横屏/PIP | 4d | 1.2 | 5 种用例全过 |
| STORY-FE-1.13 | 满意度 + 撤回 + 未读 + 断线重连 UI | 2d | 1.4 | 全链路 |
| STORY-FE-1.14 | 暗色 + 无障碍 + i18n 骨架 | 2d | 1.2 | WCAG AA |
| STORY-FE-1.15 | sdk-jsbridge(TS 类型 + 默认实现 + 宿主 demo) | 3d | proto | 文档完整 |
| STORY-FE-1.16 | 埋点 + 性能监控接入(Web Vitals) | 1d | OPS | 数据回流 |
| STORY-FE-1.17 | E2E(Playwright)golden path | 3d | 全部 | 跑在 CI |

---

## EPIC-FE-2 · 座席工作台

| Story | 描述 | 估时 | 依赖 |
|-------|------|------|------|
| STORY-FE-2.1 | 工作台三栏布局 + Tab 框架 | 2d | M0 |
| STORY-FE-2.2 | 会话列表(待接入/进行中/历史)+ 振铃 | 3d | agent-bff |
| STORY-FE-2.3 | 多会话切换 + 草稿 + 未读标识 | 2d | 2.1 |
| STORY-FE-2.4 | 上下文 Tab:用户/订阅/会员/直播间/播放诊断/历史/合规/备注 | 5d | tool-svc |
| STORY-FE-2.5 | AI 建议回复 + 快捷短语 + Markdown 编辑 | 3d | ai-hub |
| STORY-FE-2.6 | 转接/求助/抢接 UI + 主管干预浮窗 | 3d | routing |
| STORY-FE-2.7 | 实时大屏(SLA + 队列 + 故障 TopN) | 4d | report |
| STORY-FE-2.8 | 质检模块(评分卡 + 申诉) | 3d | report |

---

## EPIC-FE-3 · 管理后台

| Story | 描述 | 估时 | 依赖 |
|-------|------|------|------|
| STORY-FE-3.1 | 后台壳 + 登录 + RBAC 路由 | 2d | M0 |
| STORY-FE-3.2 | 公告(含 room/vod 定向投放) | 3d | notify-svc |
| STORY-FE-3.3 | 快捷按钮 | 2d | notify-svc |
| STORY-FE-3.4 | 多级 FAQ 编辑器(树 + 富文本 + 同义问 + 灰度 + 模拟器) | 6d | kb/ai-hub |
| STORY-FE-3.5 | 模型档位 CRUD + 测试连接 + 试聊 | 4d | llm-router |
| STORY-FE-3.6 | 知识库:文档管理 / QA / 检索调试 | 5d | kb-svc |
| STORY-FE-3.7 | Prompt 模板版本化 + A/B | 3d | ai-hub |
| STORY-FE-3.8 | 工具/业务集成配置(CDN/IM/支付/审核/版权/风控) | 4d | tool-svc |
| STORY-FE-3.9 | 坐席/技能组/排班/分配策略 | 4d | routing |
| STORY-FE-3.10 | 会话搜索(按 room/vod/uid) | 3d | report |
| STORY-FE-3.11 | 报表 dashboard ×4 | 5d | report |
| STORY-FE-3.12 | 审计日志查询 | 1d | audit |

---

## EPIC-BE-1 · 网关与会话

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-BE-1.1 | gateway-ws 框架(连接/心跳/路由/seq) | 5d |
| STORY-BE-1.2 | Redis 路由映射 + 跨节点定向推送 | 3d |
| STORY-BE-1.3 | 背压 + 限流 + 防刷 | 2d |
| STORY-BE-1.4 | 消息可靠性(Stream + 幂等 + 顺序) | 3d |
| STORY-BE-1.5 | session-svc CRUD + 状态机 | 4d |
| STORY-BE-1.6 | 离线消息 + 拉取增量 | 2d |
| STORY-BE-1.7 | 单节点 50k 长连接压测达标 | 2d |

## EPIC-BE-2 · Routing & Agent

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-BE-2.1 | routing-svc 排队 + 分配策略 | 4d |
| STORY-BE-2.2 | 技能组 + 溢出 + 优先级 | 2d |
| STORY-BE-2.3 | agent-bff(REST + WS 桥接) | 4d |
| STORY-BE-2.4 | 状态机 + 多设备互斥 | 2d |
| STORY-BE-2.5 | 主管监听/插话/抢接 | 3d |

## EPIC-BE-3 · 业务支撑

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-BE-3.1 | notify-svc:公告/快捷按钮/FAQ + 推送 | 3d |
| STORY-BE-3.2 | upload-svc + OSS STS + 病毒扫描 | 2d |
| STORY-BE-3.3 | livectx-svc:收集 + 校验 + 合并 QoE | 4d |
| STORY-BE-3.4 | tool-svc 框架(注册/审计/超时/降级) | 3d |
| STORY-BE-3.5 | 直播领域工具适配 ×8(诊断/会员/订阅/退款/举报/快照/封禁/工单) | 8d |
| STORY-BE-3.6 | audit-svc + 审计日志 | 2d |
| STORY-BE-3.7 | report-svc + ClickHouse 入湖 | 5d |

## EPIC-BE-4 · 数据层

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-BE-4.1 | MySQL schema + 迁移工具(flyway) | 2d |
| STORY-BE-4.2 | MongoDB 分片设计 + 索引 | 2d |
| STORY-BE-4.3 | Redis Cluster + 缓存策略 | 1d |
| STORY-BE-4.4 | Kafka topic 规划 + 消费者幂等 | 2d |
| STORY-BE-4.5 | Milvus collection + 双库隔离(KB/FAQ) | 2d |
| STORY-BE-4.6 | ClickHouse 表 + 物化视图 | 3d |

---

## EPIC-AI-1 · LLM Router

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-AI-1.1 | OpenAI Chat Completions 适配(stream + tools) | 3d |
| STORY-AI-1.2 | 多 provider(Azure/Anthropic/OpenAI 兼容) | 3d |
| STORY-AI-1.3 | 多档位路由 + 健康检查 + fallback | 3d |
| STORY-AI-1.4 | 限速(RPM/TPM)+ 配额 + 预算告警 | 2d |
| STORY-AI-1.5 | 缓存层(Redis hash + KB 版本) | 2d |
| STORY-AI-1.6 | KMS 加密 + 测试连接 | 2d |

## EPIC-AI-2 · 知识库与 RAG

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-AI-2.1 | 文档解析(PDF/Word/MD/网页) | 3d |
| STORY-AI-2.2 | 切片(语义 + 重叠) | 2d |
| STORY-AI-2.3 | 向量化(默认 text-embedding-3-large) | 1d |
| STORY-AI-2.4 | Hybrid 检索(向量 + BM25 + RRF) | 3d |
| STORY-AI-2.5 | Reranker(BGE-Reranker) | 2d |
| STORY-AI-2.6 | 检索调试 API(召回链路 trace) | 1d |
| STORY-AI-2.7 | FAQ 嵌入 collection + 相似匹配 | 2d |

## EPIC-AI-3 · ai-hub 编排

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-AI-3.1 | 决策器(FAQ→工具→RAG→LLM→兜底) | 3d |
| STORY-AI-3.2 | Prompt 编排 + live_context 注入 + 场景模板 | 3d |
| STORY-AI-3.3 | 工具调用循环(tool_choice + 多轮) | 3d |
| STORY-AI-3.4 | 流式输出(SSE/WS chunk + decision/done 事件) | 3d |
| STORY-AI-3.5 | 后处理(敏感词/格式化/置信打分/脱敏回填) | 2d |
| STORY-AI-3.6 | 转人工策略 + Handoff Packet 生成 | 3d |
| STORY-AI-3.7 | A/B 实验框架 | 2d |
| STORY-AI-3.8 | 离线标注 pipeline(意图/情绪批跑) | 3d |
| STORY-AI-3.9 | 回归测试集 + 上线门禁 | 3d |

---

## EPIC-OPS-1 · 平台与 CI/CD

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-OPS-1.1 | K8s + Helm + Argo CD | 3d |
| STORY-OPS-1.2 | CI 流水线(lint/test/build/sec-scan/contract) | 3d |
| STORY-OPS-1.3 | 蓝绿 / 金丝雀(Argo Rollouts) | 2d |
| STORY-OPS-1.4 | 多 AZ + 跨 region | 4d |
| STORY-OPS-1.5 | KMS / Secret 管理 + 静态加密 | 2d |
| STORY-OPS-1.6 | WAF + Ingress + 限流 | 2d |

## EPIC-OPS-2 · 可观测与压测

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-OPS-2.1 | OpenTelemetry 统一埋点 | 3d |
| STORY-OPS-2.2 | Prometheus + Grafana dashboard ×6 | 3d |
| STORY-OPS-2.3 | Loki / ELK 集中日志 | 2d |
| STORY-OPS-2.4 | k6 压测脚本 + WS 自研脚本 | 3d |
| STORY-OPS-2.5 | Chaos Mesh 实验 | 3d |
| STORY-OPS-2.6 | 告警规则 P0/P1/P2 + on-call | 2d |

---

## EPIC-QA-1 · 质量

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-QA-1.1 | 用例库(PRD 拆解 ≥ 95%) | 5d |
| STORY-QA-1.2 | E2E Playwright golden path | 3d |
| STORY-QA-1.3 | WebView 真机回归矩阵 | 3d |
| STORY-QA-1.4 | 性能压测验收 | 持续 |
| STORY-QA-1.5 | 安全渗透 + 合规走查 | 5d |

---

## EPIC-DOC-1 · 文档与培训

| Story | 描述 | 估时 |
|-------|------|------|
| STORY-DOC-1.1 | 各服务 README + RUNBOOK | 持续 |
| STORY-DOC-1.2 | OpenAPI / WS / JSBridge 自动文档 | 1d |
| STORY-DOC-1.3 | 业务方接入手册 | 2d |
| STORY-DOC-1.4 | 坐席培训手册 + 视频 | 3d |
| STORY-DOC-1.5 | on-call Runbook | 2d |

---

## 总估时(粗算,3~5 人/Agent 工作流)

| Epic | 估时 |
|------|------|
| FE-1 C 端 | ≈ 35d |
| FE-2 座席台 | ≈ 25d |
| FE-3 管理后台 | ≈ 40d |
| BE-1 网关会话 | ≈ 21d |
| BE-2 Routing+Agent | ≈ 15d |
| BE-3 业务支撑 | ≈ 27d |
| BE-4 数据层 | ≈ 12d |
| AI-1 Router | ≈ 15d |
| AI-2 KB/RAG | ≈ 14d |
| AI-3 ai-hub | ≈ 25d |
| OPS-1 平台 | ≈ 16d |
| OPS-2 可观测/压测 | ≈ 16d |
| QA-1 | ≈ 16d+持续 |
| DOC-1 | 持续 |

并行执行下,总日历周 ≈ 16 周,与 PRD M0~M8 一致。
