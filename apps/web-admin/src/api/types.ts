/** kb-svc /v1/kb/debug/search 的回包视图。 */

export interface KbDebugRoute {
  chunk_id: string;
  doc_id?: string;
  title: string;
  rank: number;
  score?: number;
  rrf_score?: number;
}

export interface KbRerankRow {
  chunk_id: string;
  title: string;
  vector_score: number;
  bm25_score: number;
  rrf_score: number;
  rerank_score: number;
  final_score: number;
  rank: number;
}

export interface KbHit {
  chunk_id: string;
  doc_id: string;
  kb_id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  score: number;
  vector_score: number;
  bm25_score: number;
  rerank_score: number;
  rank: number;
}

export interface KbDebugResponse {
  query: string;
  store_size: number;
  opts: {
    kb_id: string | null;
    top_k: number;
    vector_top: number;
    bm25_top: number;
    rrf_k: number;
    rerank_top: number;
  };
  vector: KbDebugRoute[];
  bm25: KbDebugRoute[];
  rrf: KbDebugRoute[];
  rerank: KbRerankRow[];
  hits: KbHit[];
}

export interface KbStats {
  chunks: number;
  by_kb: Record<string, number>;
  embedder: string;
  dim: number;
}

export interface KbIngestResponse {
  ok: boolean;
  chunks: number;
  doc_id: string;
}

// ───── FAQ ─────

export interface FaqAttachment {
  type?: string;
  url?: string;
  text?: string;
  [k: string]: unknown;
}

export interface FaqAnswer {
  contentMd?: string;
  attachments?: FaqAttachment[];
}

export interface FaqNode {
  id: string;
  title: string;
  icon?: string;
  sortOrder?: number;
  isLeaf?: boolean;
  synonyms?: string[];
  answer?: FaqAnswer;
  children?: FaqNode[];
}

export interface FaqTree {
  id?: string;
  scene: string;
  version?: number;
  nodes: FaqNode[];
}

export interface FaqPreviewResult {
  hit: boolean;
  how?: string;
  score?: number;
  node_id?: string;
  title?: string;
  hits?: number;
}

// ───── 运营看板 ─────

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
  status: "OFFLINE" | "IDLE" | "BUSY" | "AWAY";
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

// ───── 审计 ─────

export interface AuditActor {
  id?: number;
  role?: "AGENT" | "SUPERVISOR" | "SYSTEM" | "ADMIN";
  nickname?: string;
}

export interface AuditEvent {
  id: string;
  ts: string;
  kind: string;
  actor?: AuditActor;
  sessionId?: string;
  target?: string;
  action?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export interface AuditQueryResponse {
  items: AuditEvent[];
  size: number;
  capacity?: number;
}
