import type {
  AnnouncementRow,
  AuditQueryResponse,
  DashboardData,
  FaqPreviewResult,
  FaqTree,
  KbDebugResponse,
  KbDocsResponse,
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

export function kbListDocs(): Promise<KbDocsResponse> {
  return getJSON<KbDocsResponse>("/v1/admin/kb/docs");
}

export async function kbDeleteDoc(docId: string): Promise<void> {
  const r = await fetch("/v1/admin/kb/docs/" + encodeURIComponent(docId), { method: "DELETE" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
}

export function kbReindexDoc(docId: string): Promise<{ ok: boolean; reindexed: number }> {
  return postJSON<{ ok: boolean; reindexed: number }>(
    `/v1/admin/kb/docs/${encodeURIComponent(docId)}/reindex`,
    {},
  );
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

// ───── Prompt A/B 比对 ─────

export function listPrompts(): Promise<import("./types.js").PromptTemplate[]> {
  return getJSON<import("./types.js").PromptTemplate[]>("/v1/admin/prompts");
}

export function previewPrompt(body: {
  scene: string;
  version?: number;
  profile?: Record<string, unknown>;
  live_context?: Record<string, unknown>;
  summary?: string;
  rag_chunks?: string;
}): Promise<import("./types.js").PromptPreview> {
  return postJSON<import("./types.js").PromptPreview>("/v1/admin/prompts/preview", body);
}

export function decidePreview(body: {
  user_text: string;
  live_context?: Record<string, unknown>;
  profile?: Record<string, unknown>;
}): Promise<import("./types.js").DecisionPreview> {
  return postJSON<import("./types.js").DecisionPreview>("/v1/admin/ai/decide", {
    session_id: "ses_admin_preview",
    ...body,
  });
}

// ───── LLM 档位 ─────

export function llmListProfiles(): Promise<import("./types.js").LlmProfile[]> {
  return getJSON<import("./types.js").LlmProfile[]>("/v1/admin/llm-profiles");
}

export function llmCreateProfile(p: import("./types.js").LlmProfile): Promise<import("./types.js").LlmProfile> {
  return postJSON<import("./types.js").LlmProfile>("/v1/admin/llm-profiles", p);
}

export function llmUpdateProfile(p: import("./types.js").LlmProfile): Promise<import("./types.js").LlmProfile> {
  return putJSON<import("./types.js").LlmProfile>(
    "/v1/admin/llm-profiles/" + encodeURIComponent(p.id),
    p,
  );
}

export async function llmDeleteProfile(id: string): Promise<void> {
  const r = await fetch("/v1/admin/llm-profiles/" + encodeURIComponent(id), { method: "DELETE" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
}

export function llmTestProfile(
  id: string,
  prompt: string,
): Promise<{ ok: boolean; sample?: string; error?: string }> {
  return postJSON<{ ok: boolean; sample?: string; error?: string }>(
    `/v1/admin/llm-profiles/${encodeURIComponent(id)}/test`,
    { prompt },
  );
}

export function llmProfileQuota(id: string): Promise<import("./types.js").LlmQuotaSnapshot> {
  return getJSON<import("./types.js").LlmQuotaSnapshot>(
    `/v1/admin/llm-profiles/${encodeURIComponent(id)}/quota`,
  );
}

// ───── 工具调试器 ─────

export function listTools(): Promise<import("./types.js").ToolDef[]> {
  return getJSON<import("./types.js").ToolDef[]>("/v1/admin/tools");
}

export function invokeTool(
  name: string,
  body: { args: Record<string, unknown>; ctx?: Record<string, unknown> },
): Promise<import("./types.js").ToolInvokeResult> {
  return postJSON<import("./types.js").ToolInvokeResult>(
    `/v1/admin/tools/${encodeURIComponent(name)}/invoke`,
    body,
  );
}

// ───── 报表 ─────

export function report(
  kind: string,
  windowMin = 60,
  bucketSec?: number,
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams();
  qs.set("window_min", String(windowMin));
  if (bucketSec) qs.set("bucket_sec", String(bucketSec));
  return getJSON<Record<string, unknown>>(
    `/v1/admin/report/${encodeURIComponent(kind)}?${qs.toString()}`,
  );
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
