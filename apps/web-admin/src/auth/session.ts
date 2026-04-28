/**
 * 登录态 — localStorage 持久化 token + 角色,刷新页面不掉。
 *
 * M3 起步:token 仅作占位,生产替换为 JWT,在每次 fetch 头里带 Authorization。
 */
import type { AdminRole } from "../api/types.js";

const KEY = "ai-kefu.admin.session";

export interface AdminSession {
  token: string;
  username: string;
  role: AdminRole;
}

export function loadSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as AdminSession;
    if (!obj.token || !obj.role) return null;
    return obj;
  } catch {
    return null;
  }
}

export function saveSession(s: AdminSession): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
