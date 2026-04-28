# session-svc

会话生命周期 + 状态机 + 消息幂等存储。Spring Boot 3 / Java 21。

## 关键决策

- **状态机**:`SessionStateMachine` 集中管理跃迁(详见 `domain/SessionStatus.java` 与 PRD 01 §1)
  - `AI → QUEUEING / CLOSED`
  - `QUEUEING → IN_AGENT / AI / CLOSED`
  - `IN_AGENT → CLOSED / QUEUEING / AI`
  - `CLOSED` 终态;同状态视为幂等(便于消费者重放)
- **消息幂等**:`(session_id, client_msg_id)` 联合键;`MessageRepository.saveIdempotent` 命中已存在记录直接返回原记录,不重复入库
- **Seq 自增**:`SessionRepository.nextSeq(sessionId)`,InMemory 用 `ConcurrentMap<String, AtomicLong>`,Mongo 用 `findAndModify($inc seq)`(独立 `session_seq` 集合)
- **持久化**:可在内存 / MongoDB 之间切换(见下方"仓储后端")
- **live_context** 通过 `JsonAnySetter` 接收任意字段;M2 起在边界做 jsonschema 强校验

## 仓储后端(M2.5)

通过 `aikefu.session.store` + Spring profile 切换。

| `aikefu.session.store` | profile | 说明 |
|------------------------|---------|------|
| `memory`(默认) | (空) | 进程内 ConcurrentMap;启动不连 Mongo |
| `mongo` | `mongo` | MongoDB;由 `MongoConfig` 显式构造 `MongoTemplate`,启动后 ensure 索引 |

> Spring Boot 的 Mongo 自动配置已在 `SessionApplication` 全部排除,
> 仅 `MongoConfig`(`@Profile("mongo")`)主动构造 `MongoClient` + `MongoTemplate`,
> 因此 store=memory 时启动绝不会尝试连 Mongo。

启用 Mongo:

```bash
SPRING_PROFILES_ACTIVE=mongo \
SESSION_STORE=mongo \
MONGODB_URI=mongodb://localhost:27017/aikefu \
MONGODB_DB=aikefu \
mvn -pl services/session-svc -am spring-boot:run
```

集合 / 索引(由 `MongoConfig.ensureIndexes` 启动时建立):

| collection | 字段 | 说明 |
|------------|------|------|
| `sessions` | `_id` = sessionId | Session 文档 |
| `sessions` | `(tenantId, userId, status)` | 取当前用户的活跃会话 |
| `messages` | `_id` = msgId | Message 文档 |
| `messages` | `(sessionId, seq desc)` | 历史分页主索引 |
| `messages` | `(sessionId, clientMsgId)` 唯一 sparse | 幂等键 |
| `session_seq` | `_id` = sessionId, `seq` long | nextSeq 用,findAndModify($inc) |

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
mvn -pl services/session-svc -am test         # 单测(memory profile)
mvn -pl services/session-svc -am spring-boot:run    # 默认 :8081 + memory
```

## 后续

- T-105 已 done(消息幂等 + seq)
- T-106 离线消息 + pull 增量(对接 Redis Stream)
- 配置 MongoDB 副本集 / 分片(分片键 `{tenant_id, session_id}`)
