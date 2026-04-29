import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { kbDeleteDoc, kbIngest, kbListDocs, kbReindexDoc, kbStats } from "../api/client.js";
import type { KbDocRow, KbIngestResponse, KbStats } from "../api/types.js";

interface IngestLog {
  ts: number;
  doc_id: string;
  title: string;
  chunks: number;
  ok: boolean;
  err?: string;
}

/**
 * 知识库入库 UI — 表单录入文档,提交到 POST /v1/admin/kb/ingest;
 * 顶部展示当前 chunks/embedder 状态,本地保留最近 20 条入库流水。
 */
export function KbIngestPanel() {
  const [stats, setStats] = useState<KbStats | null>(null);
  const [docId, setDocId] = useState("");
  const [kbId, setKbId] = useState("default");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [metaJson, setMetaJson] = useState("{}");
  const [logs, setLogs] = useState<IngestLog[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    kbStats()
      .then(setStats)
      .catch((e: unknown) => setErr(`stats: ${(e as Error).message}`));
  };
  useEffect(refresh, []);

  const submit = async () => {
    if (!docId.trim() || !title.trim() || !body.trim()) return;
    let metadata: Record<string, unknown> = {};
    try {
      metadata = metaJson.trim() ? (JSON.parse(metaJson) as Record<string, unknown>) : {};
    } catch (e) {
      setErr(`metadata 不是合法 JSON:${(e as Error).message}`);
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r: KbIngestResponse = await kbIngest({
        id: docId.trim(),
        kb_id: kbId.trim() || "default",
        title: title.trim(),
        body,
        metadata,
      });
      setLogs((prev) =>
        [
          { ts: Date.now(), doc_id: r.doc_id, title: title.trim(), chunks: r.chunks, ok: r.ok },
          ...prev,
        ].slice(0, 20),
      );
      setDocId("");
      setTitle("");
      setBody("");
      refresh();
    } catch (e: unknown) {
      const msg = (e as Error).message;
      setLogs((prev) =>
        [
          { ts: Date.now(), doc_id: docId.trim(), title: title.trim(), chunks: 0, ok: false, err: msg },
          ...prev,
        ].slice(0, 20),
      );
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>知识库入库</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          POST /v1/admin/kb/ingest → kb-svc:切片 + 嵌入 + 入库
        </span>
        {stats ? (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-secondary)" }}>
            chunks={stats.chunks} · embedder={stats.embedder}({stats.dim}d) ·{" "}
            {Object.entries(stats.by_kb).map(([k, n]) => `${k}=${n}`).join(" ")}
          </span>
        ) : null}
      </header>

      <DocsList refreshKey={logs.length} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        <GlassCard strength="base" radius={12} className="admin-card" style={{ overflow: "auto" }}>
          <strong style={{ fontSize: 13 }}>新文档</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <Field label="id (唯一文档 id,如 doc_play_buffer_v3)">
              <input value={docId} onChange={(e) => setDocId(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="kb_id (库 id,默认 default)">
              <input value={kbId} onChange={(e) => setKbId(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="body (正文,会被 chunker 切片)">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono, monospace)" }}
              />
            </Field>
            <Field label="metadata (JSON)">
              <textarea
                value={metaJson}
                onChange={(e) => setMetaJson(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono, monospace)" }}
              />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <Capsule
                size="md"
                variant="primary"
                onClick={() => void submit()}
                disabled={submitting || !docId.trim() || !title.trim() || !body.trim()}
              >
                {submitting ? "入库中…" : "入库"}
              </Capsule>
              {err ? (
                <span style={{ color: "#d33", fontSize: 12, alignSelf: "center" }}>{err}</span>
              ) : null}
            </div>
          </div>
        </GlassCard>

        <GlassCard strength="base" radius={12} className="admin-card" style={{ overflow: "auto" }}>
          <strong style={{ fontSize: 13 }}>最近入库流水(本地缓存,最近 20 条)</strong>
          {logs.length === 0 ? (
            <p style={{ color: "var(--color-text-tertiary)", fontSize: 12, marginTop: 8 }}>
              提交后会在这里显示。
            </p>
          ) : (
            <table className="admin-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>doc_id</th>
                  <th>title</th>
                  <th className="num">chunks</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.ts}>
                    <td className="num">{new Date(l.ts).toLocaleTimeString()}</td>
                    <td style={{ color: "var(--color-text-tertiary)" }}>{l.doc_id}</td>
                    <td>{l.title}</td>
                    <td className="num">{l.chunks}</td>
                    <td>
                      {l.ok ? (
                        <span style={{ color: "#0a7" }}>✓ OK</span>
                      ) : (
                        <span style={{ color: "#d33" }} title={l.err}>
                          ✗ {l.err?.slice(0, 60)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{label}</span>
      {children}
    </label>
  );
}

function DocsList({ refreshKey }: { refreshKey: number }) {
  const [docs, setDocs] = useState<KbDocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await kbListDocs();
      setDocs(r.items);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const onDel = async (docId: string) => {
    if (!confirm(`确认删除文档 ${docId}?该文档全部 chunk 都会被移除`)) return;
    setBusyId(docId);
    try {
      await kbDeleteDoc(docId);
      await refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  };

  const onReindex = async (docId: string) => {
    setBusyId(docId);
    try {
      const r = await kbReindexDoc(docId);
      alert(`重嵌入完成,刷新了 ${r.reindexed} 个 chunk 的向量`);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <GlassCard strength="base" radius={12} className="admin-card" style={{ overflow: "auto", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>文档列表({docs.length})</strong>
        <Capsule size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </Capsule>
        {err ? <span style={{ color: "#d33", fontSize: 12 }}>{err}</span> : null}
      </div>
      <table className="admin-table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>kb_id</th>
            <th>doc_id</th>
            <th>title</th>
            <th className="num">chunks</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {docs.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 12 }}>
                暂无文档
              </td>
            </tr>
          ) : (
            docs.map((d) => (
              <tr key={d.doc_id}>
                <td>{d.kb_id}</td>
                <td style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>
                  {d.doc_id}
                </td>
                <td>{d.title}</td>
                <td className="num">{d.chunks}</td>
                <td style={{ display: "flex", gap: 4 }}>
                  <Capsule
                    size="sm"
                    variant="ghost"
                    onClick={() => void onReindex(d.doc_id)}
                    disabled={busyId === d.doc_id}
                  >
                    重嵌入
                  </Capsule>
                  <Capsule
                    size="sm"
                    variant="outline"
                    onClick={() => void onDel(d.doc_id)}
                    disabled={busyId === d.doc_id}
                  >
                    删除
                  </Capsule>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </GlassCard>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "6px 10px",
  background: "var(--color-surface-alt)",
  color: "var(--color-text-primary)",
  outline: "none",
  font: "inherit",
  fontSize: 13,
  width: "100%",
};
