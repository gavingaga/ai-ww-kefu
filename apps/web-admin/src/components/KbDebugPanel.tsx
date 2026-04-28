import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { kbDebugSearch, kbStats } from "../api/client.js";
import type { KbDebugResponse, KbDebugRoute, KbRerankRow, KbStats } from "../api/types.js";

/**
 * KB 检索调参面板 — 输入 query/参数,展示每路召回排名 + 融合中间分。
 */
export function KbDebugPanel() {
  const [stats, setStats] = useState<KbStats | null>(null);
  const [query, setQuery] = useState("视频卡顿怎么办");
  const [kbId, setKbId] = useState<string>("");
  const [topK, setTopK] = useState(5);
  const [vectorTop, setVectorTop] = useState(20);
  const [bm25Top, setBm25Top] = useState(20);
  const [rrfK, setRrfK] = useState(60);
  const [rerankTop, setRerankTop] = useState(15);
  const [resp, setResp] = useState<KbDebugResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    kbStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(`stats: ${(e as Error).message}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async () => {
    if (!query.trim()) return;
    setRunning(true);
    setErr(null);
    try {
      const r = await kbDebugSearch({
        query: query.trim(),
        kb_id: kbId.trim() || null,
        top_k: topK,
        vector_top: vectorTop,
        bm25_top: bm25Top,
        rrf_k: rrfK,
        rerank_top: rerankTop,
      });
      setResp(r);
    } catch (e: unknown) {
      setErr((e as Error).message);
      setResp(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="admin-layout">
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          padding: "0 4px",
        }}
      >
        <strong style={{ fontSize: 18 }}>KB 检索调试</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          POST /v1/admin/kb/debug/search → kb-svc
        </span>
        {stats ? (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-secondary)" }}>
            chunks={stats.chunks} · embedder={stats.embedder}({stats.dim}d) ·{" "}
            {Object.entries(stats.by_kb).map(([k, n]) => `${k}=${n}`).join(" ")}
          </span>
        ) : null}
      </header>

      <GlassCard strength="base" radius={12} className="admin-card">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr" }}>
          <label style={{ gridColumn: "1 / span 6", display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ minWidth: 60 }}>query</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) run();
              }}
              style={inputStyle}
            />
          </label>
          <NumField label="kb_id" value={kbId} onChange={setKbId} type="text" placeholder="留空=全部" />
          <NumField label="top_k" value={topK} onChange={(v) => setTopK(Number(v) || 0)} />
          <NumField label="vector_top" value={vectorTop} onChange={(v) => setVectorTop(Number(v) || 0)} />
          <NumField label="bm25_top" value={bm25Top} onChange={(v) => setBm25Top(Number(v) || 0)} />
          <NumField label="rrf_k" value={rrfK} onChange={(v) => setRrfK(Number(v) || 0)} />
          <NumField label="rerank_top" value={rerankTop} onChange={(v) => setRerankTop(Number(v) || 0)} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Capsule size="md" variant="primary" onClick={run} disabled={running || !query.trim()}>
            {running ? "检索中…" : "运行"}
          </Capsule>
          {err ? (
            <span style={{ color: "var(--color-danger, #d33)", fontSize: 12 }}>错误:{err}</span>
          ) : null}
          {resp ? (
            <span style={{ color: "var(--color-text-tertiary)", fontSize: 12, marginLeft: "auto" }}>
              store_size={resp.store_size} · 向量 {resp.vector.length} · BM25 {resp.bm25.length} · RRF{" "}
              {resp.rrf.length} · 最终 {resp.hits.length}
            </span>
          ) : null}
        </div>
      </GlassCard>

      {resp ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            flex: 1,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          <RouteTable title="向量召回 (cosine)" rows={resp.vector} scoreKey="score" />
          <RouteTable title="BM25 召回" rows={resp.bm25} scoreKey="score" />
          <RouteTable title="RRF 融合" rows={resp.rrf} scoreKey="rrf_score" />
          <RerankTable rows={resp.rerank} />
          <FinalHits rows={resp.hits} />
        </div>
      ) : (
        <GlassCard strength="base" radius={12} className="admin-card" style={{ flex: 1, color: "var(--color-text-tertiary)" }}>
          填写参数后点「运行」查看每路召回排名与融合中间分。
        </GlassCard>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  type = "number",
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "number" | "text";
  placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
      <span style={{ minWidth: 70, color: "var(--color-text-secondary)" }}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function RouteTable({
  title,
  rows,
  scoreKey,
}: {
  title: string;
  rows: KbDebugRoute[];
  scoreKey: "score" | "rrf_score";
}) {
  return (
    <GlassCard strength="base" radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
      <span style={{ color: "var(--color-text-tertiary)", marginLeft: 8, fontSize: 12 }}>
        {rows.length} 条
      </span>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>title</th>
            <th>chunk_id</th>
            <th className="num">{scoreKey}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.chunk_id + r.rank}>
              <td className="num">{r.rank}</td>
              <td>{r.title}</td>
              <td style={{ color: "var(--color-text-tertiary)" }}>{r.chunk_id}</td>
              <td className="num">{((r as Record<string, unknown>)[scoreKey] as number)?.toFixed(4) ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

function RerankTable({ rows }: { rows: KbRerankRow[] }) {
  return (
    <GlassCard strength="base" radius={12} className="admin-card" style={{ overflow: "auto", gridColumn: "1 / span 2" }}>
      <strong style={{ fontSize: 13 }}>Rerank 综合得分</strong>
      <span style={{ color: "var(--color-text-tertiary)", marginLeft: 8, fontSize: 12 }}>
        {rows.length} 条 · final = 0.6×rrf + 0.4×rerank
      </span>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>title</th>
            <th>chunk_id</th>
            <th className="num">vector</th>
            <th className="num">bm25</th>
            <th className="num">rrf</th>
            <th className="num">rerank</th>
            <th className="num">final</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.chunk_id + r.rank}>
              <td className="num">{r.rank}</td>
              <td>{r.title}</td>
              <td style={{ color: "var(--color-text-tertiary)" }}>{r.chunk_id}</td>
              <td className="num">{r.vector_score.toFixed(4)}</td>
              <td className="num">{r.bm25_score.toFixed(4)}</td>
              <td className="num">{r.rrf_score.toFixed(4)}</td>
              <td className="num">{r.rerank_score.toFixed(4)}</td>
              <td className="num">
                <strong>{r.final_score.toFixed(4)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

function FinalHits({ rows }: { rows: KbDebugResponse["hits"] }) {
  return (
    <GlassCard strength="base" radius={12} className="admin-card" style={{ overflow: "auto", gridColumn: "1 / span 2" }}>
      <strong style={{ fontSize: 13 }}>最终命中(返给 ai-hub)</strong>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>title</th>
            <th className="num">score</th>
            <th>content</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.chunk_id}>
              <td className="num">{h.rank}</td>
              <td>{h.title}</td>
              <td className="num">{h.score.toFixed(4)}</td>
              <td style={{ color: "var(--color-text-secondary)" }}>
                {(h.content ?? "").slice(0, 220)}
                {(h.content?.length ?? 0) > 220 ? "…" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "6px 10px",
  background: "var(--color-surface-alt)",
  color: "var(--color-text-primary)",
  outline: "none",
  font: "inherit",
  fontSize: 13,
  minWidth: 0,
};
