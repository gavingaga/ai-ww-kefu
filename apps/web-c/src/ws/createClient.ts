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
}

export function createWs(cfg: AppWsConfig = {}): ReconnectingWS | null {
  // dev 兜底:浏览器在 5173 / 5174 / 5175 时,默认连同主机 :8080 的 gateway-ws,
  // 让 `pnpm dev` 不需要再额外设 VITE_WS_URL 也能联调通。生产环境请显式配。
  const envUrl = import.meta.env.VITE_WS_URL;
  let url = cfg.url ?? envUrl;
  if (!url && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    url = `${proto}//${window.location.hostname}:8080/v1/ws`;
  }
  if (!url) return null;
  return new ReconnectingWS({
    url: () => (cfg.token ? `${url}?token=${encodeURIComponent(cfg.token)}` : url),
  });
}
