/** agent-bff 的精简 TS 视图 — 仅取 web-agent 用得到的字段。 */

export type AgentStatus = "OFFLINE" | "IDLE" | "BUSY" | "AWAY";

export interface AgentInfo {
  id: number;
  nickname?: string;
  avatarUrl?: string;
  status: AgentStatus;
  skillGroups?: string[];
  maxConcurrency?: number;
  activeSessionIds?: string[];
}

export interface QueueEntry {
  id: string;
  sessionId: string;
  skillGroup: string;
  enqueuedAt?: string;
  priority?: number;
  packet?: HandoffPacket;
}

export interface HandoffPacket {
  session_id: string;
  reason: string;
  user?: Record<string, unknown>;
  summary?: string;
  history?: Array<{ role: string; content: string }>;
  entities?: Record<string, unknown>;
  suggested_replies?: string[];
  knowledge_hits?: Array<{ title: string; url?: string }>;
  live_context?: Record<string, unknown>;
  skill_group_hint?: string;
}

export interface SessionView {
  id: string;
  status: "ai" | "queueing" | "in_agent" | "closed";
  liveContext?: Record<string, unknown>;
  agentId?: number | null;
  startedAt?: string;
}

export interface InboxResponse {
  agent: AgentInfo;
  waiting: QueueEntry[];
  active: SessionView[];
}

export interface MessageView {
  id: string;
  sessionId: string;
  seq: number;
  role: "user" | "ai" | "agent" | "system";
  type: string;
  content?: { text?: string; [k: string]: unknown };
  status?: string;
  createdAt?: string;
}

export interface HistoryResponse {
  items: MessageView[];
  hasMore: boolean;
}
