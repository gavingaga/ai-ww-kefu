import type {
  AgentInfo,
  AgentStatus,
  HistoryResponse,
  InboxResponse,
  MessageView,
  QueueEntry,
} from "./types.js";

const BASE = "/v1/agent";

function headers(agentId: number, extra?: Record<string, string>): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Agent-Id": String(agentId),
    ...(extra ?? {}),
  };
}

async function jsonOr<T>(resp: Response, fallback?: T): Promise<T> {
  if (resp.status === 204) return fallback as T;
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return (await resp.json()) as T;
}

export async function register(body: {
  id: number;
  nickname?: string;
  skillGroups?: string[];
  maxConcurrency?: number;
  role?: "AGENT" | "SUPERVISOR";
}): Promise<AgentInfo> {
  const r = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOr<AgentInfo>(r);
}

export async function setStatus(agentId: number, status: AgentStatus): Promise<AgentInfo> {
  const r = await fetch(`${BASE}/status`, {
    method: "POST",
    headers: headers(agentId),
    body: JSON.stringify({ status }),
  });
  return jsonOr<AgentInfo>(r);
}

export async function inbox(agentId: number): Promise<InboxResponse> {
  const r = await fetch(`${BASE}/inbox`, { headers: headers(agentId) });
  return jsonOr<InboxResponse>(r);
}

export async function accept(agentId: number, entryId: string): Promise<unknown> {
  const r = await fetch(`${BASE}/sessions/accept`, {
    method: "POST",
    headers: headers(agentId),
    body: JSON.stringify({ entry_id: entryId }),
  });
  return jsonOr<unknown>(r);
}

export async function closeSession(agentId: number, sessionId: string): Promise<unknown> {
  const r = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
    headers: headers(agentId),
  });
  return jsonOr<unknown>(r);
}

export async function transferToAi(agentId: number, sessionId: string): Promise<unknown> {
  const r = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/transfer`, {
    method: "POST",
    headers: headers(agentId),
  });
  return jsonOr<unknown>(r);
}

export async function listMessages(
  sessionId: string,
  before = 0,
  limit = 30,
): Promise<HistoryResponse> {
  const r = await fetch(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}/messages?before=${before}&limit=${limit}`,
  );
  return jsonOr<HistoryResponse>(r);
}

export async function reply(
  agentId: number,
  sessionId: string,
  text: string,
  clientMsgId?: string,
): Promise<MessageView> {
  const r = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: headers(agentId, clientMsgId ? { "Idempotency-Key": clientMsgId } : undefined),
    body: JSON.stringify({
      type: "text",
      content: { text },
      clientMsgId: clientMsgId ?? `agent-${Date.now()}`,
    }),
  });
  return jsonOr<MessageView>(r);
}

export async function peek(agentId: number): Promise<QueueEntry | null> {
  const r = await fetch(`${BASE}/peek`, { method: "POST", headers: headers(agentId) });
  if (r.status === 204) return null;
  return jsonOr<QueueEntry>(r);
}

// ───── 主管干预(T-302) ─────

export async function listSupervisors(): Promise<AgentInfo[]> {
  const r = await fetch(`/v1/supervisor/list`);
  return jsonOr<AgentInfo[]>(r);
}

export async function whisper(
  supervisorId: number,
  sessionId: string,
  text: string,
): Promise<unknown> {
  const r = await fetch(`/v1/supervisor/whisper`, {
    method: "POST",
    headers: headers(supervisorId),
    body: JSON.stringify({ session_id: sessionId, text }),
  });
  return jsonOr<unknown>(r);
}

export async function steal(
  supervisorId: number,
  fromAgentId: number,
  sessionId: string,
): Promise<unknown> {
  const r = await fetch(`/v1/supervisor/steal`, {
    method: "POST",
    headers: headers(supervisorId),
    body: JSON.stringify({ from_agent_id: fromAgentId, session_id: sessionId }),
  });
  return jsonOr<unknown>(r);
}

export async function transfer(
  fromAgentId: number,
  toAgentId: number,
  sessionId: string,
): Promise<unknown> {
  const r = await fetch(`/v1/supervisor/transfer`, {
    method: "POST",
    headers: headers(fromAgentId),
    body: JSON.stringify({ to_agent_id: toAgentId, session_id: sessionId }),
  });
  return jsonOr<unknown>(r);
}

export async function observe(supervisorId: number, sessionId: string): Promise<unknown> {
  const r = await fetch(`/v1/supervisor/observe`, {
    method: "POST",
    headers: headers(supervisorId),
    body: JSON.stringify({ session_id: sessionId }),
  });
  return jsonOr<unknown>(r);
}

export async function unobserve(supervisorId: number, sessionId: string): Promise<unknown> {
  const r = await fetch(`/v1/supervisor/unobserve`, {
    method: "POST",
    headers: headers(supervisorId),
    body: JSON.stringify({ session_id: sessionId }),
  });
  return jsonOr<unknown>(r);
}

export interface DeviceHeartbeatResp {
  ok: boolean;
  holder: string;
  evicted: string;
}

/** 同坐席多 Tab 互锁:启动 + 每 5s 调一次,服务端发现新 device 会推 device-evicted。 */
export async function deviceHeartbeat(
  agentId: number,
  deviceId: string,
): Promise<DeviceHeartbeatResp> {
  const r = await fetch("/v1/agent/device/heartbeat", {
    method: "POST",
    headers: { ...headers(agentId), "X-Device-Id": deviceId },
  });
  return jsonOr<DeviceHeartbeatResp>(r);
}

export interface AiSessionRow {
  id: string;
  status: string;
  startedAt?: string;
  liveContext?: Record<string, unknown>;
  agentId?: number | null;
}

/** AI 托管中的会话列表(默认 status=ai)— 坐席台板块用。 */
export async function listAiSessions(limit = 100): Promise<AiSessionRow[]> {
  const r = await fetch(`/v1/agent/ai-sessions?status=ai&limit=${limit}`);
  return jsonOr<AiSessionRow[]>(r);
}

export async function deviceRelease(agentId: number, deviceId: string): Promise<void> {
  await fetch("/v1/agent/device/release", {
    method: "POST",
    headers: { ...headers(agentId), "X-Device-Id": deviceId },
  });
}

export async function dashboard(): Promise<import("./types.js").DashboardData> {
  const r = await fetch(`/v1/supervisor/dashboard`);
  return jsonOr<import("./types.js").DashboardData>(r);
}

export async function supervisorReport(
  kind: string,
  windowMin = 30,
): Promise<Record<string, unknown>> {
  const r = await fetch(
    `/v1/supervisor/report/${encodeURIComponent(kind)}?window_min=${windowMin}`,
  );
  return jsonOr<Record<string, unknown>>(r);
}

// ───── 高风险审批 ─────

export interface ApprovalRow {
  id: string;
  agent_id: number;
  session_id: string;
  tool: string;
  args?: Record<string, unknown>;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  comment?: string;
  decided_by?: number;
  created_at?: string;
  decided_at?: string;
}

export async function submitApproval(
  agentId: number,
  body: { session_id: string; tool: string; args?: Record<string, unknown>; reason?: string },
): Promise<ApprovalRow> {
  const r = await fetch("/v1/agent/approvals", {
    method: "POST",
    headers: { ...headers(agentId) },
    body: JSON.stringify(body),
  });
  return jsonOr<ApprovalRow>(r);
}

export async function getApproval(agentId: number, id: string): Promise<ApprovalRow> {
  const r = await fetch(`/v1/agent/approvals/${encodeURIComponent(id)}`, {
    headers: { ...headers(agentId) },
  });
  return jsonOr<ApprovalRow>(r);
}

export async function listPendingApprovals(): Promise<ApprovalRow[]> {
  const r = await fetch("/v1/supervisor/approvals");
  return jsonOr<ApprovalRow[]>(r);
}

export async function decideApproval(
  supervisorId: number,
  id: string,
  approve: boolean,
  comment?: string,
): Promise<ApprovalRow> {
  const r = await fetch(`/v1/supervisor/approvals/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    headers: { ...headers(supervisorId) },
    body: JSON.stringify({ approve, comment }),
  });
  return jsonOr<ApprovalRow>(r);
}
