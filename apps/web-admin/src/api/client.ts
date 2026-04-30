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

const SESSION_KEY = "ai-kefu.admin.session";

function authHeader(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as { token?: string };
    return obj.token ? { Authorization: `Bearer ${obj.token}` } : {};
  } catch {
    return {};
  }
}

/** 401 / 403 时清掉本地 session,触发 App 回到登录页。 */
function checkAuth(r: Response): void {
  if (r.status === 401 || r.status === 403) {
    localStorage.removeItem(SESSION_KEY);
  }
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  checkAuth(r);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} ${text}`);
  }
  return (await r.json()) as T;
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: authHeader() });
  checkAuth(r);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  checkAuth(r);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} ${text}`);
  }
  return (await r.json()) as T;
}

async function deleteJSON<T>(path: string): Promise<T> {
  const r = await fetch(path, { method: "DELETE", headers: authHeader() });
  checkAuth(r);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  if (r.status === 204) return {} as T;
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

/** 真实后端返的 user 形态;前端 AdminRole 由 roles[] 映射得到。 */
interface BackendUser {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  roles: string[];
  agentId?: number;
  disabled?: boolean;
}
interface BackendLoginResponse {
  token: string;
  user: BackendUser;
  expires_in: number;
}

/**
 * 把后端 roles[] 映射到前端 AdminRole(三档枚举):
 *   owner / admin → ADMIN
 *   supervisor → SUPERVISOR
 *   其它(agent / viewer / developer)→ AGENT
 */
function mapRole(roles: string[] | undefined): "ADMIN" | "SUPERVISOR" | "AGENT" {
  const s = new Set((roles ?? []).map((r) => r.toLowerCase()));
  if (s.has("owner") || s.has("admin")) return "ADMIN";
  if (s.has("supervisor")) return "SUPERVISOR";
  return "AGENT";
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const r = await fetch("/v1/admin/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`登录失败: ${r.status} ${text}`);
  }
  const data = (await r.json()) as BackendLoginResponse;
  return {
    ok: true,
    token: data.token,
    user: { username: data.user.username, role: mapRole(data.user.roles) },
  };
}

export async function logout(): Promise<void> {
  await fetch("/v1/admin/auth/logout", { method: "POST", headers: authHeader() });
}

// ───── 组织管理(用户 / 坐席 / 技能组) ─────

export interface AdminUserView {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  roles: string[];
  agentId?: number;
  disabled?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export function listAdminUsers(): Promise<{
  items: AdminUserView[];
  offset: number;
  limit: number;
}> {
  return getJSON("/v1/admin/users?offset=0&limit=200");
}

export function inviteUser(body: {
  username?: string;
  email?: string;
  displayName?: string;
  password?: string;
  roles?: string[];
  agentId?: number;
}): Promise<{ user: AdminUserView; temporary_password?: string }> {
  return postJSON("/v1/admin/users/invite", body);
}

export function setUserDisabled(id: number, disabled: boolean): Promise<AdminUserView> {
  return postJSON(`/v1/admin/users/${id}/${disabled ? "disable" : "enable"}`, {});
}

export function resetUserPassword(
  id: number,
): Promise<{ user_id: number; temporary_password: string }> {
  return postJSON(`/v1/admin/users/${id}/reset-password`, {});
}

export function setUserRoles(id: number, roles: string[]): Promise<AdminUserView> {
  return putJSON(`/v1/admin/users/${id}/roles`, { roles });
}

export interface AdminAgentView {
  id: number;
  nickname?: string;
  avatarUrl?: string;
  status?: string;
  role?: "AGENT" | "SUPERVISOR";
  skillGroups?: string[];
  maxConcurrency?: number;
  activeSessionIds?: string[];
}

export function listAdminAgents(): Promise<AdminAgentView[]> {
  return getJSON("/v1/admin/agents");
}

export function updateAdminAgent(
  id: number,
  patch: Partial<AdminAgentView>,
): Promise<AdminAgentView> {
  return putJSON(`/v1/admin/agents/${id}`, patch);
}

export interface SkillGroupView {
  id: number;
  code: string;
  name?: string;
  description?: string;
  parentCode?: string;
  priority?: number;
  slaSeconds?: number;
  active?: boolean;
}

export function listSkillGroups(): Promise<SkillGroupView[]> {
  return getJSON("/v1/admin/skill-groups");
}

export function createSkillGroup(body: SkillGroupView): Promise<SkillGroupView> {
  return postJSON("/v1/admin/skill-groups", body);
}

export function updateSkillGroup(
  id: number,
  body: Partial<SkillGroupView>,
): Promise<SkillGroupView> {
  return putJSON(`/v1/admin/skill-groups/${id}`, body);
}

export function deactivateSkillGroup(id: number): Promise<SkillGroupView> {
  return deleteJSON(`/v1/admin/skill-groups/${id}`);
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

export function llmCreateProfile(
  p: import("./types.js").LlmProfile,
): Promise<import("./types.js").LlmProfile> {
  return postJSON<import("./types.js").LlmProfile>("/v1/admin/llm-profiles", p);
}

export function llmUpdateProfile(
  p: import("./types.js").LlmProfile,
): Promise<import("./types.js").LlmProfile> {
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
