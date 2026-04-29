/**
 * 主题切换 — 在 <html> 上设 data-theme,设计令牌 CSS 已写好暗色变量。
 *
 * URL 优先 (?theme=dark|light|auto),其次 localStorage,最后 prefers-color-scheme。
 * auto 模式监听系统切换。
 */

export type ThemeMode = "light" | "dark" | "auto";

export function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  const url = new URL(window.location.href);
  const u = url.searchParams.get("theme");
  if (u === "light" || u === "dark" || u === "auto") return u;
  try {
    const s = localStorage.getItem("aikefu.theme");
    if (s === "light" || s === "dark" || s === "auto") return s;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const apply = (effective: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", effective);
  };
  if (mode === "auto") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mq.matches ? "dark" : "light");
    mq.onchange = (e) => apply(e.matches ? "dark" : "light");
    return;
  }
  apply(mode);
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem("aikefu.theme", mode);
  } catch {
    /* ignore */
  }
  applyTheme(mode);
}
