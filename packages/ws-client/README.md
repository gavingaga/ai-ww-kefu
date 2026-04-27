# @ai-kefu/ws-client

客户端 WebSocket wrapper — C 端 / 座席台 / sdk-jsbridge 共享。

实现 PRD `02 §3.6` / `08 §4` 中约定的客户端行为:

- 重连(指数退避 + jitter,最大 30s)
- 心跳:25s 主动 ping,30s 无包断连重连
- 客户端帧:`msg.*` 自动注入 `client_msg_id`(幂等);未连接时入队,连接后顺序发送
- 服务端帧:按 `seq` 顺序判定,重复丢弃,缺漏自动 `pull { after_seq }`
- 周期 `ack` 上报最大已收 `seq`(默认 5s)
- `pendingLimit` 溢出优先牺牲非业务帧(typing/event.context),保业务帧

## 使用

```ts
import { ReconnectingWS } from "@ai-kefu/ws-client";

const ws = new ReconnectingWS({
  url: () => `wss://api.example.com/v1?token=${getToken()}`,
});

ws.on("open", () => console.warn("[ws] open"));
ws.on("frame", (f) => {
  if (f.type === "msg.text") {
    // 渲染气泡
  }
});
ws.on("status", (s) => updateConnectionBar(s.state, s.pending));

ws.start();

// 发送一条文本
ws.send({
  type: "msg.text",
  session_id: "ses_xxx",
  payload: { text: "你好" },
});

// 程序退出时
ws.close();
```

## 测试

```bash
pnpm --filter @ai-kefu/ws-client test
```

覆盖:握手 / seq 顺序 / 重复丢弃 / gap pull / 重连 + pull 增量 / client_msg_id
回执销账 / manual close 不重连 / pendingLimit 溢出策略。
