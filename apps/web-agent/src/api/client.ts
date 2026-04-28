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
