# session-svc

会话生命周期 + 状态机 + 消息幂等存储。Spring Boot 3 / Java 21。

## 关键决策

- **状态机**:`SessionStateMachine` 集中管理跃迁(详见 `domain/SessionStatus.java` 与 PRD 01 §1)
  - `AI → QUEUEING / CLOSED`
  - `QUEUEING → IN_AGENT / AI / CLOSED`
  - `IN_AGENT → CLOSED / QUEUEING / AI`
  - `CLOSED` 终态;同状态视为幂等(便于消费者重放)
- **消息幂等**:`(session_id, client_msg_id)` 联合键;`MessageRepository.saveIdempotent` 命中已存在记录直接返回原记录,不重复入库
- **Seq 自增**:`Session.nextSeq()`(M1 内存原子计数,M2 用 MongoDB findAndModify)
- **持久化**:M1 内存(`InMemorySessionRepository` / `InMemoryMessageRepository`),M2 起替换为 MongoDB(分片键 `{tenant_id, session_id}`)
- **live_context** 通过 `JsonAnySetter` 接收任意字段;M2 起在边界做 jsonschema 强校验

## REST 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/sessions/current?tenant_id=&user_id=` | 取或开当前会话 |
| GET | `/v1/sessions/{id}` | 详情 |
| POST | `/v1/sessions/{id}/handoff` | 转人工(AI → QUEUEING) |
| POST | `/v1/sessions/{id}/close` | 结束 |
| POST | `/v1/sessions/{id}/live-context` | 更新 live_context |
| GET | `/v1/sessions/{id}/messages?before=&limit=` | 历史(seq 倒序) |
| POST | `/v1/sessions/{id}/messages` | 写入(支持 `Idempotency-Key`) |

错误码:
- 404 `session_not_found`
- 409 `illegal_state_transition`

## 运行

```bash
# 仓库根
mvn -pl services/session-svc -am test         # 单测
mvn -pl services/session-svc -am spring-boot:run
# 默认 :8081
```

## 后续

- T-105 已 done(消息幂等 + seq)
- T-106 离线消息 + pull 增量(对接 Redis Stream)
- M2 起接入 MongoDB / Mongo Atlas Search;`live_context` 落库;ai_trace
