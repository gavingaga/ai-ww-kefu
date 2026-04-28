# @ai-kefu/web-agent

座席工作台 — 三栏布局,聚合 `services/agent-bff`。

## 三栏

- **左** `SessionList` — 待接入(routing 队列条目)+ 进行中
- **中** `ConversationView` — 选中会话的消息流(轮询 4s)+ 候选回复 + 输入区
- **右** `ContextPanel` — HandoffPacket(原因/技能组/用户/实体/摘要/历史)+ live_context

顶部 `StatusBar`:状态切换(IDLE/BUSY/AWAY/OFFLINE)+ 队列与并行计数。

## 启动

```bash
pnpm i
# 后端联通(分别启动 ai-hub / routing-svc / session-svc / agent-bff;见各自 README)

# 启 dev,默认代理 /v1/agent → http://localhost:8084(agent-bff)
pnpm --filter @ai-kefu/web-agent dev
# 浏览器:http://localhost:5174?agent_id=1&nickname=alice&skill_groups=general,play_tech
```

URL 参数:

| 参数 | 默认 | 说明 |
|------|------|------|
| `agent_id` | `1` | 坐席 ID(`X-Agent-Id` 头) |
| `nickname` | `坐席<id>` | |
| `skill_groups` | `general,play_tech,membership_payment` | 逗号分隔 |

## 当前进度(M3 起步,T-305)

- 三栏 + 状态条 + 候选回复
- 接入队列(`packet.summary` / VIP 标 / reason 标)
- 接入流程:接受 → packet 缓存 → 选中会话 → 右栏渲染上下文
- 消息流:轮询拉取 + Bubble 渲染(role=user/ai/agent/system)
- 操作:发送 / 转回 AI / 结束

后续:
- WebSocket 实时推送(替换轮询)
- 工具与知识库面板(快捷短语 / FAQ 引用)
- 主管干预(监听 / 插话 / 抢接)
