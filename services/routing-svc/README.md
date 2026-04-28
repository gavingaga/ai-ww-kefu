# routing-svc

排队 / 分配 / 技能组 / 坐席状态。Spring Boot 3 / Java 21。

## REST(节选)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/queue/enqueue` | 入队(由 ai-hub 主动调,带 packet) |
| GET | `/v1/queue?skill_group=` | 列出队列 |
| GET | `/v1/queue/{id}/position` | 排队位置 |
| GET | `/v1/stats` | 队列 + 坐席状态摘要 |
| POST | `/v1/agents` | 注册 / 更新坐席 |
| POST | `/v1/agents/{id}/status` | 更新状态 |
| POST | `/v1/agents/{id}/peek` | 取一条派单候选(不抢占) |
| POST | `/v1/agents/{id}/assign` | 派单(写入 active sessions) |
| POST | `/v1/sessions/{id}/release?agent_id=` | 释放 |

## 分配策略

| name | 说明 |
|------|------|
| `vip_first`(默认) | VIP > priority asc > 入队时间 asc |
| `fifo` | 入队时间 asc |
| `least_busy` | 暂同 fifo,坐席侧 load 由调用方控制 |
| `round_robin` | 暂同 fifo |

应用配置 `aikefu.routing.strategy` 切换;`aikefu.routing.queue-overflow-seconds` 控制溢出阈值。

## 优先级映射(packet.reason → priority)

| reason | priority |
|--------|---------|
| minor_compliance | 10(最高) |
| report_compliance | 30 |
| user_request | 50 |
| 其它 | 100 |

## 后续

- T-302 主管干预(监听 / 插话 / 抢接)
- M3 Redis Stream 替换内存队列
- 与 audit-svc 联动写审计
