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
