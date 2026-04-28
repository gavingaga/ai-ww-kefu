import type { KbDebugResponse, KbStats } from "./types.js";

/** 走 vite proxy → agent-bff /v1/admin/* 透传到 kb-svc。 */

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} ${text}`);
  }
  return (await r.json()) as T;
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

export interface DebugSearchInput {
  query: string;
  kb_id?: string | null;
  top_k?: number;
  vector_top?: number;
  bm25_top?: number;
  rrf_k?: number;
  rerank_top?: number;
}

export function kbDebugSearch(input: DebugSearchInput): Promise<KbDebugResponse> {
  return postJSON<KbDebugResponse>("/v1/admin/kb/debug/search", input);
}

export function kbStats(): Promise<KbStats> {
  return getJSON<KbStats>("/v1/admin/kb/stats");
}
