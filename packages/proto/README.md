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

## codegen

> 输出在 `packages/proto/dist/` 下,被 `.gitignore`,通过 `package.json` 的 `exports`
> 暴露给消费方;**消费方 import 前需先 `pnpm proto:gen`**(根命令)。

### 命令(在仓库根)

```bash
# 安装依赖
pnpm i
uv sync --group dev          # 装 datamodel-code-generator(可选)

# 校验 + 生成全部
pnpm proto:validate          # spectral lint + ajv validate
pnpm proto:gen               # TS + Python(无 Python 环境时仅生成 TS)
pnpm --filter @ai-kefu/proto run build   # validate + gen 一步

# breaking 变更检测(需 oasdiff;CI 自动跑)
pnpm proto:check-breaking
```

### 输出物

- `dist/ts/visitor.d.ts` 等 — `openapi-typescript` 生成,`paths` / `components` 类型
- `dist/ts/ws-client.d.ts` / `ws-events.d.ts` — `json-schema-to-typescript`
- `dist/ts/live-context.d.ts` — JSON Schema → TS
- `dist/ts/index.{js,d.ts}` — re-export 汇总
- `dist/python/visitor.py` 等 — `datamodel-code-generator` (pydantic v2)

### 消费

```ts
// 任意 TS 应用 / 服务
import type { paths, components } from "@ai-kefu/proto/visitor";
import type { LiveContext } from "@ai-kefu/proto/live-context";
import type { WsClientFrame } from "@ai-kefu/proto/ws/client";
import type { KefuBridge } from "@ai-kefu/proto/jsbridge";  // 直接拿手写 .d.ts
```

```python
# Python 服务
from proto.visitor import Session, Message, FaqTree
from proto.live_context import LiveContext
```

### Java DTO(预留,M1 起接入)

打算用 `openapi-generator-cli`(jar / npm 二选一)输出到
`services/<svc>/src/main/java/com/aikefu/proto/`。当 `services/*` 下 Java 模块开始建立后,
在 `packages/proto/scripts/` 增 `codegen-java.mjs` 并接到 `gen` 中;暂不阻塞当前阶段。
