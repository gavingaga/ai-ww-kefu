# 执行进度

> 起始基线:M0~M3 主链路已通(gateway-ws / session-svc(Mongo) / routing-svc / agent-bff /
> ai-hub / kb-svc / livectx-svc / audit-svc + web-c / web-agent / web-admin)。
>
> 本文件按 `05-技术任务清单.md` 的 ID 跟踪剩余工作,完成一项划掉一项。

## 优先级 P0(生产前阻塞 / 业务核心)

- [x] **T-221** tool-svc 工具框架(注册 / 审计 / 超时 / 降级)
- [x] **T-222** tool-svc:`get_play_diagnostics` 真适配(消费 livectx-svc)
- [x] **T-223** tool-svc:`get_room_info` / `get_vod_info`
- [x] **T-224** tool-svc:`get_membership` / `get_subscription_orders` / `cancel_subscription`
       (写操作 dry_run + 二次确认通道)
- [x] **T-225** tool-svc:`report_content` 留痕
- [x] **T-226** tool-svc:`get_anchor_info`
- [x] **T-108** upload-svc:STS / 直传 / 病毒扫描钩子 / 白名单(支撑 T-401)
- [x] **T-401** web-c 图片 / 文件上传(直传 / 进度 / 失败提示)
- [x] **T-405** web-c 满意度评价卡(星级 + 标签 + 评论)+ 30s 撤回重评 + notify-svc /v1/csat
- [x] **T-114** web-admin 登录(mock,localStorage)+ RBAC(ADMIN/SUPERVISOR/AGENT NAV 过滤)+ 公告 / 快捷按钮 CRUD(notify-svc 内存存储)

## 优先级 P1(数据底座 + 运营观测)

- [x] **T-501** report-svc(POST /v1/events + 6 聚合 kpi/csat/tools/agents/handoff/timeseries;Auditor 自动镜像)
- [x] **T-502** web-admin 报表看板(KPI / CSAT 分布 / 转人工原因 / 工具 TopN / 坐席排行,5s 刷新)
- [x] **T-310** web-agent 实时大屏故障 TopN(转人工 reason 条形 + 工具失败率告警)+ 赛事预警 banner(同 skill_group 排队 ≥3 红底)
- [x] **T-307** web-agent ContextPanel 完整 8 Tab(概览/用户/订阅/直播间/诊断/历史/合规/备注),走 agent-bff /v1/agent/tools/* 透传 tool-svc
- [x] **T-308** web-agent AI 建议回复(ai-hub /v1/ai/suggest 非流式 + agent-bff 透传 + ConversationView 输入条上方面板)
- [x] **T-311** 高风险操作二次审批(agent-bff ApprovalStore + Auditor 留痕;坐席 ContextPanel 订阅 Tab 申请 + 2s 轮询;主管 SupervisorDashboard 待审面板,通过/驳回带评论)

## 优先级 P2(增强体验 + 配置后台)

- [x] **T-215** web-admin LLM 档位 CRUD + 试聊 + 配额(llm-router POST/PUT/DELETE/v1/profiles + agent-bff /v1/admin/llm-profiles 透传 + LlmProfilesPanel:列表 / 表单 / api_key 留空保旧)
- [x] **T-216** Prompt A/B 比对(ai-hub GET /v1/prompts + POST /v1/prompts/preview;PromptsPanel:scene 胶囊 + 双 version 选择 + 并排渲染)
- [x] **T-219** web-admin 转人工策略可视化(ai-hub POST /v1/ai/decide 不调 LLM;DecisionPlaygroundPanel:5 用户语预设 + 决策路径流图 + decision 详情)
- [x] **T-217** web-admin 知识库管理(kb-svc GET /v1/kb/docs + DELETE/{id} + POST/{id}/reindex;agent-bff 透传;KbIngestPanel 顶部加文档列表 + 重嵌入 / 删除按钮)
- [x] **T-228** web-c RoomSnapshotCard(房间/节目/清晰度/卡顿/网络 Tag + 播放诊断按钮 → verdict 高亮 + 切清晰度 / 重进直播间)
- [x] **T-229** web-admin ToolPlaygroundPanel(列出 tool-svc 工具 + 选定工具看 schema + JSON 编辑 args/ctx + invoke 后看 result/audit_id;agent-bff /v1/admin/tools 透传)
- [x] **T-227** sdk-jsbridge:JsBridge 类 + getKefuBridge 单例;原生 → web 两级路由;接口齐:setLiveContext / requestPlayDiagnostics / switchQuality / reenterRoom / minimize / openLink / onOrientation / onPipChange
- [x] **T-220+** livectx-svc 字段强校验(LiveContextValidator:scene/quality/state/report.type/network.type 枚举 + id 非负 + uid 正 + boolean 类型 + stream_url_hash 防明文 URL + fps∈[0,240];错误数组 400)
- [x] **T-203** llm-router 限速 RPM/TPM + 日预算(QuotaManager 滑窗 + ModelProfile 加 budget_usd_daily/rate_in_per_1k/rate_out_per_1k;429 / 503 + X-Budget-Used-Pct 头;GET /v1/profiles/{id}/quota 快照)
- [x] **T-204** KMS 注入 Key(llm-router kms.py 抽象 + LocalKmsResolver 演示;profile.api_key 支持 kms://provider/key_id 启动时解出;日志只掩码末 4 位;5 测试 + ProfileRegistry.from_env 接入。试聊接口已存在,即 T-215 列表行内"试聊"按钮)

## 优先级 P3(平台化 / 长尾)

- [x] **T-304** 多设备互斥(agent-bff DeviceLockStore TTL 15s + heartbeat/release REST + SSE device-evicted 推老 Tab;web-agent 5s 心跳 + 被踢页面)
- [x] **T-106** session-svc 离线消息 pull(MessageRepository.findSince + GET /v1/sessions/{id}/messages/since?seq=&limit= 升序;Mongo + Memory 双实现)
- [x] **T-103** gateway-ws 压测脚本(Go,gorilla/websocket;-n / -rate / -dur / -interval;每 5s 进度 + RTT p50/p90/p99 汇总)
- [x] **T-402** 公告 critical 强制常驻(MarqueeBar 关闭按钮 ≠ critical 才显示);非 critical 已有 localStorage 24h skip
- [x] **T-403** 快捷按钮点击数据回流(notify-svc POST /v1/quick-replies/{id}/click + GET /clicks 内存计数;web-c QuickReplies 行内 fire-and-forget)
- [x] **T-404** web-c 形态适配(?form=bubble|drawer|fullscreen 在 <html> 设 data-form;CSS 切换宽高;横屏 ≤500px 公告紧凑)
- [x] **T-406** 暗色(?theme=dark|light|auto + 监听系统切换)+ i18n(zh/en 字典 + ?lang= URL + localStorage)
- [ ] **T-503** 质检模块
- [ ] **T-505** 回归测试集 + 上线门禁
- [ ] **T-506** A/B 实验框架

## 已完成(本轮新增,非历史里程碑)

- [x] AI 答复入库(LLM 文本 / FAQ / handoff → session-svc.aiMeta)
- [x] T-205 RAG 文本块召回回填(kb-svc → ai-hub → web-agent aiMeta UI)
- [x] T-207 kb-svc 检索调试 API + web-admin KB 调试页
- [x] web-admin FAQ 节点管理 + KB 入库 UI
- [x] T-208 决策器单测扩展(5 路径优先级矩阵)
- [x] T-301/T-302 SupervisorDashboard 活跃会话 + 抢接
- [x] web-admin 运营看板(/v1/admin/dashboard 透传)
- [x] T-209 prompt 场景路由扩展测试
- [x] T-411 工具调用 UI 提示(确认 / 重试 / 进度)
- [x] audit-svc + web-admin 审计页
- [x] livectx-svc 联调(服务端权威字段拼合,堵住 H5 伪造)
