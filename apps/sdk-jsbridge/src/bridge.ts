/**
 * 宿主桥 — 对外 API 形态稳定;内部按"原生 → 纯 web"两级路由:
 *
 * 1. 原生宿主(iOS WKWebView / Android WebView / 客户端 React Native 等)在
 *    {@link Window.kefu} 注入回调,优先调原生
 * 2. 纯 web / 调试时,SDK 走 fetch livectx-svc 兜底,功能降级但接口形态不变
 */

import type {
  LiveContext,
  NativeBridge,
  Orientation,
  PlayDiagnostics,
  Quality,
} from "./types.js";

export interface BridgeOptions {
  /** livectx-svc 基址(纯 web 兜底用,默认走当前 origin /v1/live) */
  livectxBase?: string;
}

export class JsBridge {
  private readonly livectxBase: string;

  constructor(opts: BridgeOptions = {}) {
    this.livectxBase = opts.livectxBase ?? "";
  }

  private native(): NativeBridge | undefined {
    if (typeof window === "undefined") return undefined;
    return window.kefu;
  }

  /** 上报当前 LiveContext。原生缺失时 POST /v1/live/context。 */
  async setLiveContext(ctx: LiveContext): Promise<void> {
    const n = this.native();
    if (n?.setLiveContext) {
      await n.setLiveContext(ctx);
      return;
    }
    await fetch(this.livectxBase + "/v1/live/context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ctx),
    });
  }

  /** 拉播放诊断。原生侧通常拿到 player 真实 QoE 直接给;web 走客服侧的 tool-svc。 */
  async requestPlayDiagnostics(keys: { room_id?: number; vod_id?: number }): Promise<PlayDiagnostics> {
    const n = this.native();
    if (n?.requestPlayDiagnostics) return n.requestPlayDiagnostics(keys);
    // web fallback:简单返回 unknown(真实使用时通过 ai-hub 工具循环调 tool-svc)
    return {
      verdict: "unknown",
      summary: "纯 web SDK,缺少原生 QoE,请直接联系客服描述现象。",
    };
  }

  switchQuality(q: Quality): void {
    const n = this.native();
    if (n?.switchQuality) {
      void n.switchQuality(q);
      return;
    }
    console.info("[kefu sdk] switchQuality web-noop:", q);
  }

  reenterRoom(roomId?: number): void {
    const n = this.native();
    if (n?.reenterRoom) {
      void n.reenterRoom(roomId);
      return;
    }
    if (typeof window !== "undefined") window.location.reload();
  }

  minimize(): void {
    const n = this.native();
    if (n?.minimize) {
      n.minimize();
      return;
    }
    if (typeof window !== "undefined" && window.history?.length > 0) window.history.back();
  }

  openLink(url: string): void {
    if (!/^https?:\/\//i.test(url)) return;
    const n = this.native();
    if (n?.openLink) {
      n.openLink(url);
      return;
    }
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  }

  onOrientation(cb: (o: Orientation) => void): () => void {
    const n = this.native();
    if (n?.onOrientation) {
      n.onOrientation(cb);
      return () => undefined;
    }
    if (typeof window === "undefined") return () => undefined;
    const handler = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      cb(w > h ? "landscape" : "portrait");
    };
    window.addEventListener("resize", handler);
    handler();
    return () => window.removeEventListener("resize", handler);
  }

  onPipChange(cb: (inPip: boolean) => void): () => void {
    const n = this.native();
    if (n?.onPipChange) {
      n.onPipChange(cb);
      return () => undefined;
    }
    if (typeof document === "undefined") return () => undefined;
    const enter = () => cb(true);
    const leave = () => cb(false);
    document.addEventListener("enterpictureinpicture", enter as EventListener);
    document.addEventListener("leavepictureinpicture", leave as EventListener);
    return () => {
      document.removeEventListener("enterpictureinpicture", enter as EventListener);
      document.removeEventListener("leavepictureinpicture", leave as EventListener);
    };
  }
}
