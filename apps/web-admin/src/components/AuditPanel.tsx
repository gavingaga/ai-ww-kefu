import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { auditQuery } from "../api/client.js";
import type { AuditEvent, AuditQueryResponse } from "../api/types.js";

const KIND_PRESETS: Array<{ key: string; label: string }> = [
  { key: "", label: "全部" },
  { key: "session.accept", label: "接入" },
  { key: "session.close", label: "结束" },
  { key: "session.transfer_to_ai", label: "转回 AI" },
  { key: "supervisor.observe", label: "监听" },
  { key: "supervisor.unobserve", label: "取消监听" },
  { key: "supervisor.transfer", label: "转接" },
  { key: "supervisor.steal", label: "抢接" },
  { key: "supervisor.whisper", label: "插话" },
];

/**
 * 审计流水 — /v1/admin/audit/events 透传到 audit-svc。
 *
 * 支持按 kind / actor_id / session_id / since 筛选;5s 自动刷新;表格倒序展示。
 */
export function AuditPanel() {
  const [resp, setResp] = useState<AuditQueryResponse | null>(null);
  const [kind, setKind] = useState("");
  const [actorIdRaw, setActorIdRaw] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await auditQuery({
        kind: kind || undefined,
        actorId: actorIdRaw ? Number(actorIdRaw) : undefined,
        sessionId: sessionId || undefined,
        since: since || undefined,
        limit,
      });
      setResp(r);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void run(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, kind, actorIdRaw, sessionId, since, limit]);

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>审计流水</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          GET /v1/admin/audit/events → audit-svc(倒序,最新优先)
        </span>
        {resp ? (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-tertiary)" }}>
            缓存 {resp.size}/{resp.capacity ?? "?"} 条 · 命中 {resp.items.length} 条
          </span>
        ) : null}
      </header>

      <GlassCard strength="base" radius={12} className="admin-card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>kind:</span>
          {KIND_PRESETS.map((p) => (
            <Capsule
              key={p.key || "_all"}
              size="sm"
              variant={kind === p.key ? "primary" : "ghost"}
              onClick={() => setKind(p.key)}
            >
              {p.label}
            </Capsule>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, marginTop: 10 }}>
          <Field label="kind (自由输入,覆盖上方)">
            <input value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="actor_id">
            <input
              value={actorIdRaw}
              onChange={(e) => setActorIdRaw(e.target.value.replace(/\D/g, ""))}
              style={inputStyle}
            />
          </Field>
          <Field label="session_id">
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="since (ISO 或毫秒)">
            <input
              value={since}
              onChange={(e) => setSince(e.target.value)}
              placeholder="2026-04-28T00:00:00Z"
              style={inputStyle}
            />
          </Field>
          <Field label="limit">
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 100)))}
              style={{ ...inputStyle, width: 80 }}
            />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <Capsule size="sm" variant="primary" onClick={() => void run()} disabled={loading}>
            {loading ? "查询中…" : "查询"}
          </Capsule>
          <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />{" "}
            5s 自动刷新
          </label>
          {err ? <span style={{ color: "#d33", fontSize: 12 }}>错误:{err}</span> : null}
        </div>
      </GlassCard>

      <GlassCard strength="base" radius={12} className="admin-card" style={{ flex: 1, overflow: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>kind</th>
              <th>发起者</th>
              <th>会话</th>
              <th>目标</th>
              <th>动作</th>
              <th>meta</th>
            </tr>
          </thead>
          <tbody>
            {!resp || resp.items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 16 }}>
                  暂无匹配记录
                </td>
              </tr>
            ) : (
              resp.items.map((ev) => <Row key={ev.id} ev={ev} />)
            )}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

function Row({ ev }: { ev: AuditEvent }) {
  return (
    <tr>
      <td className="num" title={ev.ts}>
        {formatTs(ev.ts)}
      </td>
      <td>
        <span
          style={{
            fontSize: 11,
            padding: "1px 6px",
            borderRadius: 999,
            background: kindColor(ev.kind),
            color: "var(--color-text-primary)",
          }}
        >
          {ev.kind}
        </span>
      </td>
      <td style={{ fontSize: 12 }}>
        {ev.actor?.id ? (
          <>
            <strong>#{ev.actor.id}</strong>
            <span style={{ marginLeft: 4, color: "var(--color-text-tertiary)" }}>
              {ev.actor.role}
            </span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "var(--color-text-secondary)" }}>
        {ev.sessionId ?? "—"}
      </td>
      <td style={{ color: "var(--color-text-secondary)" }}>{ev.target ?? "—"}</td>
      <td>{ev.action ?? "—"}</td>
      <td style={{ color: "var(--color-text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono, monospace)" }}>
        {ev.meta ? JSON.stringify(ev.meta).slice(0, 120) : "—"}
      </td>
    </tr>
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

function formatTs(ts: string): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function kindColor(kind: string): string {
  if (kind.startsWith("supervisor.")) {
    return "color-mix(in srgb, #fc0 16%, var(--color-surface-alt))";
  }
  if (kind.startsWith("session.")) {
    return "color-mix(in srgb, #0a7 14%, var(--color-surface-alt))";
  }
  return "var(--color-surface-alt)";
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
