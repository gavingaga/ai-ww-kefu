/**
 * 重连退避策略 — 指数退避 + 抖动(jitter)。
 *  attempt 0 → ~1s
 *  attempt 1 → ~2s
 *  attempt 2 → ~4s
 *  ...
 *  封顶 maxMs(默认 30s)
 *
 * 抖动用 ±25% 全相对偏移,避免羊群效应。
 */
export interface BackoffOpts {
  baseMs?: number;
  maxMs?: number;
  jitter?: number; // 0~1,默认 0.25
}

export function nextDelay(attempt: number, opts: BackoffOpts = {}): number {
  const base = opts.baseMs ?? 1000;
  const max = opts.maxMs ?? 30_000;
  const jitter = opts.jitter ?? 0.25;
  const expo = Math.min(base * 2 ** attempt, max);
  const delta = expo * jitter * (Math.random() * 2 - 1);
  return Math.max(base, Math.round(expo + delta));
}
