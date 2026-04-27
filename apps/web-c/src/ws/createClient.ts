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
  const url = cfg.url ?? import.meta.env.VITE_WS_URL;
  if (!url) return null;
  return new ReconnectingWS({
    url: () => (cfg.token ? `${url}?token=${encodeURIComponent(cfg.token)}` : url),
  });
}
