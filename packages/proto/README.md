# @ai-kefu/proto

跨服务、跨 Agent **共享契约**。所有改动必须走 04-契约优先工作流。

## 内容

```
openapi/
├── visitor.yaml          # C 端 REST
├── agent.yaml            # 座席 BFF REST
├── admin.yaml            # 管理后台 REST
├── ai-internal.yaml      # AI 内部
└── tool.yaml             # 工具协议

ws/
├── client.schema.json    # 客户端 ↔ 服务端 帧
└── events.schema.json    # 系统事件

jsbridge/
└── kefu.d.ts             # JSBridge TS 类型(C 端 ↔ 宿主 App)

live-context/
└── live-context.schema.json   # 直播 / 点播 业务上下文(v1)

grpc/
├── routing.proto
├── ai.proto
└── tool.proto
```

## 校验

- OpenAPI 用 `spectral lint`
- JSON Schema 用 `ajv-cli validate`
- gRPC 用 `buf lint` + `buf breaking`

## codegen(后续 T-008 接入)

输出到各应用 / 服务的源码目录:

- TS 客户端类型:`apps/web-c|web-agent|web-admin/src/api/`
- Java DTO:`services/<svc>/src/main/java/.../proto/`
- Python pydantic:`services/<svc>/src/proto/`
- Postman collection 与 Mock server 一并产出
