/**
 * 包装 ReconnectingWS — 注入 token 取得函数与默认 url。
 *
 * 真实环境从 `/visitors/auth` 响应里拿到 ws_endpoint;
 * 在 dev / mock 阶段(没有后端)走环境变量 VITE_WS_URL,缺省时关闭。
 */

import { ReconnectingWS } from "@ai-kefu/ws-client";

export interface AppWsConfig {
  url?: string;
  token?: string;
  /** 必须 — gateway-ws 用它绑定 hub.bySID,缺它则坐席侧 push 命不中。 */
  sessionId?: string;
  uid?: string | number;
}

export function createWs(cfg: AppWsConfig = {}): ReconnectingWS | null {
  const envUrl = import.meta.env.VITE_WS_URL;
  let baseUrl = cfg.url ?? envUrl;
  if (!baseUrl && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    baseUrl = `${proto}//${window.location.hostname}:8080/v1/ws`;
  }
  if (!baseUrl) return null;
  return new ReconnectingWS({
    url: () => {
      const q = new URLSearchParams();
      if (cfg.token) q.set("token", cfg.token);
      if (cfg.sessionId) q.set("session_id", cfg.sessionId);
      if (cfg.uid != null) q.set("uid", String(cfg.uid));
      const s = q.toString();
      return s ? `${baseUrl}?${s}` : baseUrl!;
    },
  });
}
