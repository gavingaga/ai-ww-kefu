/** agent-bff 的精简 TS 视图 — 仅取 web-agent 用得到的字段。 */

export type AgentStatus = "OFFLINE" | "IDLE" | "BUSY" | "AWAY";

export interface AgentInfo {
  id: number;
  nickname?: string;
  avatarUrl?: string;
  status: AgentStatus;
  /** 角色:AGENT(默认)/ SUPERVISOR(主管,可干预) */
  role?: "AGENT" | "SUPERVISOR";
  skillGroups?: string[];
  maxConcurrency?: number;
  activeSessionIds?: string[];
  observingSessionIds?: string[];
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

export interface RagChunkRef {
  chunk_id?: string;
  doc_id?: string;
  kb_id?: string;
  title?: string;
  content?: string;
  score?: number;
}

export interface AiMeta {
  decision_action?: string;
  decision_reason?: string;
  ref_user_msg_id?: string;
  tokens_out?: number;
  rag_top_title?: string;
  rag_score?: number;
  rag_chunks?: RagChunkRef[];
  tool_calls?: Array<{ name?: string; args?: unknown; ok?: boolean; result?: unknown; error?: string }>;
  [k: string]: unknown;
}

export interface MessageView {
  id: string;
  sessionId: string;
  seq: number;
  /** 客户端消息 ID(幂等键),坐席侧也用于去重 SSE 重复推送 */
  clientMsgId?: string;
  role: "user" | "ai" | "agent" | "system";
  type: string;
  content?: { text?: string; [k: string]: unknown };
  status?: string;
  createdAt?: string;
  /** AI 角色专属:决策、RAG 引用、工具调用记录(由 gateway-ws 写入)。 */
  aiMeta?: AiMeta;
}

export interface HistoryResponse {
  items: MessageView[];
  hasMore: boolean;
}

// ───── 主管视图(T-302) ─────

export interface DashboardKpi {
  queue_total: number;
  vip_waiting: number;
  aged_waiting: number;
  minor_waiting: number;
  max_wait_seconds: number;
  agents_idle: number;
  agents_busy: number;
  agents_away: number;
  agents_offline: number;
  supervisors: number;
  load: number;
  capacity: number;
  load_ratio: number;
  strategy: string;
}

export interface DashboardAgentRow {
  id: number;
  nickname: string;
  status: AgentStatus;
  role: "AGENT" | "SUPERVISOR";
  skill_groups: string[];
  load: number;
  max_concurrency: number;
  active_session_ids: string[];
  observing_session_ids: string[];
}

export interface DashboardQueueRow {
  id: string;
  session_id: string;
  skill_group: string;
  priority: number;
  vip: boolean;
  reason?: string;
  summary?: string;
  enqueued_at?: string;
  waited_seconds: number;
  overflowed: boolean;
}

export interface DashboardData {
  kpi: DashboardKpi;
  queue_by_group: Record<string, number>;
  agents: DashboardAgentRow[];
  queue: DashboardQueueRow[];
}
