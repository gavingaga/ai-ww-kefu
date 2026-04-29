# apps/sdk-jsbridge

宿主原生桥 — 给 H5 客服(web-c)和接入方业务页提供统一调用方式,
封装客户端的 LiveContext 上报 / 播放诊断 / 切清晰度 / 重进直播间 / 最小化 /
打开链接 / 屏幕方向 / PIP 变化等能力。

## 装载策略

1. **原生宿主优先**:iOS/Android 在 `window.kefu` 注入 `NativeBridge` 时
   SDK 直接调原生(零延迟,QoE 数据来自 player 内部);
2. **纯 web 兜底**:无 `window.kefu` 时,SDK 用 fetch 调 livectx-svc 等服务,
   体验降级但接口形态不变 — 调试 / 网页版客服可单独运行。

## 使用

```ts
import { getKefuBridge } from "@ai-kefu/sdk-jsbridge";

const sdk = getKefuBridge();

await sdk.setLiveContext({
  scene: "live_room",
  room_id: 8001,
  play: { state: "buffering", quality: "1080p", buffer_events_60s: 5 },
  network: { type: "wifi", rtt_ms: 80 },
});

const diag = await sdk.requestPlayDiagnostics({ room_id: 8001 });
if (diag.verdict === "local_network") sdk.switchQuality("480p");

const off = sdk.onOrientation((o) => console.log("orientation:", o));
// 离开页面时
off();
```

## 宿主注入参考(iOS/Android 伪码)

```js
window.kefu = {
  setLiveContext: (ctx) => window.webkit.messageHandlers.kefu.postMessage(["setLiveContext", ctx]),
  requestPlayDiagnostics: (k) => /* player.getQoE() → Promise */,
  switchQuality: (q) => window.webkit.messageHandlers.kefu.postMessage(["switchQuality", q]),
  // ...
};
```
