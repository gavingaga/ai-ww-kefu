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
- [ ] **T-310** web-agent 实时大屏故障 TopN / 赛事预警
- [x] **T-307** web-agent ContextPanel 完整 8 Tab(概览/用户/订阅/直播间/诊断/历史/合规/备注),走 agent-bff /v1/agent/tools/* 透传 tool-svc
- [ ] **T-308** web-agent AI 建议回复独立面板
- [ ] **T-311** 高风险操作二次审批(退款 / 未成年 / 封禁)

## 优先级 P2(增强体验 + 配置后台)

- [ ] **T-215** web-admin 模型档位 CRUD + 测试连接 + 试聊
- [ ] **T-216** Prompt 模板 A/B 切流
- [ ] **T-219** web-admin 转人工策略可视化 + 决策预览
- [ ] **T-217** web-admin 知识库管理(列表 / 删除 / 重嵌入,目前只有入库)
- [ ] **T-228** web-c 直播间快照卡 + 播放诊断卡
- [ ] **T-229** web-admin 工具调试器
- [ ] **T-227** sdk-jsbridge:setLiveContext / requestPlayDiagnostics 等
- [ ] **T-220+** livectx-svc 字段强校验(JSON Schema 拒绝伪造)
- [ ] **T-203** llm-router 限速 RPM/TPM + 预算告警
- [ ] **T-204** KMS 注入 Key + 测试连接

## 优先级 P3(平台化 / 长尾)

- [ ] **T-304** agent-bff 多设备互斥(同坐席多 Tab 互锁)
- [ ] **T-106** session-svc 离线消息 + pull 增量
- [ ] **T-103** gateway-ws 50k 连接压测脚本
- [ ] **T-402** 公告 critical 常驻 + 关闭 24h + 定向
- [ ] **T-403** 快捷按钮分组 + 数据回流
- [ ] **T-404** web-c 形态适配(悬浮/抽屉/全屏/横屏/PIP)
- [ ] **T-406** 暗色 + WCAG + i18n
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
