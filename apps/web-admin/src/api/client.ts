import type {
  AnnouncementRow,
  AuditQueryResponse,
  DashboardData,
  FaqPreviewResult,
  FaqTree,
  KbDebugResponse,
  KbIngestResponse,
  KbStats,
  LoginResponse,
  QuickReplyRow,
} from "./types.js";

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

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} ${text}`);
  }
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

export interface IngestInput {
  id: string;
  kb_id: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export function kbIngest(input: IngestInput): Promise<KbIngestResponse> {
  return postJSON<KbIngestResponse>("/v1/admin/kb/ingest", input);
}

// ───── FAQ ─────

export function faqTrees(): Promise<FaqTree[]> {
  return getJSON<FaqTree[]>("/v1/admin/faq/trees");
}

export function faqSaveTree(tree: FaqTree): Promise<FaqTree> {
  return putJSON<FaqTree>("/v1/admin/faq/trees", tree);
}

export function faqPreview(query: string): Promise<FaqPreviewResult> {
  return postJSON<FaqPreviewResult>("/v1/admin/faq/preview", { query });
}

// ───── Dashboard ─────

export function dashboard(): Promise<DashboardData> {
  return getJSON<DashboardData>("/v1/admin/dashboard");
}

// ───── Audit ─────

export interface AuditQueryInput {
  kind?: string;
  actorId?: number;
  sessionId?: string;
  since?: string;
  limit?: number;
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return postJSON<LoginResponse>("/v1/admin/login", { username, password });
}

// ───── 公告 / 快捷按钮 ─────

export function listAnnouncements(): Promise<AnnouncementRow[]> {
  return getJSON<AnnouncementRow[]>("/v1/admin/announcements");
}

export function saveAnnouncement(row: AnnouncementRow): Promise<AnnouncementRow> {
  return postJSON<AnnouncementRow>("/v1/admin/announcements", row);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await fetch("/v1/admin/announcements/" + encodeURIComponent(id), { method: "DELETE" });
}

export function listQuickReplies(): Promise<QuickReplyRow[]> {
  return getJSON<QuickReplyRow[]>("/v1/admin/quick-replies");
}

export function saveQuickReply(row: QuickReplyRow): Promise<QuickReplyRow> {
  return postJSON<QuickReplyRow>("/v1/admin/quick-replies", row);
}

export async function deleteQuickReply(id: string): Promise<void> {
  await fetch("/v1/admin/quick-replies/" + encodeURIComponent(id), { method: "DELETE" });
}

export function auditQuery(q: AuditQueryInput): Promise<AuditQueryResponse> {
  const params = new URLSearchParams();
  if (q.kind) params.set("kind", q.kind);
  if (q.actorId) params.set("actor_id", String(q.actorId));
  if (q.sessionId) params.set("session_id", q.sessionId);
  if (q.since) params.set("since", q.since);
  if (q.limit) params.set("limit", String(q.limit));
  const qs = params.toString();
  return getJSON<AuditQueryResponse>("/v1/admin/audit/events" + (qs ? "?" + qs : ""));
}
