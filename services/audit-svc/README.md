# services/audit-svc

审计流水(主管干预 / 坐席动作 / 内容审核结论 / KB & FAQ 变更)。

## 端点

```
GET  /v1/audit/healthz                              健康检查
POST /v1/audit/events     {kind, actor, ...}        追加一条审计
GET  /v1/audit/events?kind=&actor_id=&session_id=&since=&limit=
                                                    倒序查询(最新优先)
```

`since` 接受 ISO-8601 或纯毫秒时间戳。`kind` 推荐值见
[`AuditEvent`](src/main/java/com/aikefu/audit/domain/AuditEvent.java)。

## 存储

M3 起步内存环形 buffer(默认 5000 条),通过 `AUDIT_BUFFER_SIZE` 调整;
后续接 Mongo / ClickHouse(只换 `AuditStore` 实现,API 不变)。

## 端口

默认 `8085`;可通过 `AUDIT_PORT` 覆盖。
