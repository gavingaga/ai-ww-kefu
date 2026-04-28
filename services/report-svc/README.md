# services/report-svc

事件入湖 + 报表聚合(M3 内存版,M5 替换 ClickHouse + Kafka 入湖)。

## 端点

```
POST /v1/events                                            事件入湖
GET  /v1/report/kpi?window_min=60                          总览
GET  /v1/report/csat?window_min=60                         评分分布 + tag TopN
GET  /v1/report/tools?window_min=60                        工具调用 TopN
GET  /v1/report/agents?window_min=60                       坐席动作排行
GET  /v1/report/handoff?window_min=60                      转人工原因分布
GET  /v1/report/timeseries?window_min=60&bucket_sec=300    时序桶
```

## 事件 schema

```jsonc
{
  "kind": "session.accept",        // session.* / tool.invoke / csat / supervisor.* ...
  "actor": { "id": 7, "role": "AGENT" },
  "sessionId": "ses_xxx",
  "target": "...",                 // 工具名 / 转给的坐席
  "action": "ok|dry_run|timeout|error",
  "meta": { "duration_ms": 120, "reason": "..." }
}
```

接入方:agent-bff Auditor / tool-svc AuditEmitter 都可以同步把事件发一份到这里。

