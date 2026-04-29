import { useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { decidePreview } from "../api/client.js";
import type { DecisionPreview } from "../api/types.js";

const PRESETS = [
  { label: "卡顿", text: "看视频卡顿,帮我看一下" },
  { label: "投诉", text: "我要投诉这个主播" },
  { label: "退款", text: "我未成年的孩子打赏了 1000 块,要退款" },
  { label: "看节目", text: "晚上几点看 NBA?" },
  { label: "切清晰度", text: "怎么切到 480p?" },
];

/** 转人工策略可视化 — 输入用户语,看决策器走哪条路(handoff/faq/rag/llm)。 */
export function DecisionPlaygroundPanel() {
  const [text, setText] = useState("看视频卡顿,帮我看一下");
  const [scene, setScene] = useState("live_room");
  const [roomId, setRoomId] = useState(8001);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DecisionPreview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (input?: string) => {
    const t = (input ?? text).trim();
    if (!t) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await decidePreview({
        user_text: t,
        live_context: { scene, room_id: roomId },
      });
      setResult(r);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>转人工策略</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          POST /v1/admin/ai/decide → ai-hub(只跑决策器 + FAQ/KB,不调 LLM)
        </span>
      </header>

      <GlassCard radius={12} className="admin-card">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>试试:</span>
          {PRESETS.map((p) => (
            <Capsule
              key={p.label}
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(p.text);
                void run(p.text);
              }}
            >
              {p.label}
            </Capsule>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px auto", gap: 8, marginTop: 10 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void run();
            }}
            placeholder="用户语"
            style={inputStyle}
          />
          <input
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            placeholder="scene"
            style={inputStyle}
          />
          <input
            type="number"
            value={roomId}
            onChange={(e) => setRoomId(Number(e.target.value))}
            placeholder="room_id"
            style={inputStyle}
          />
          <Capsule size="md" variant="primary" onClick={() => void run()} disabled={busy || !text.trim()}>
            {busy ? "决策中…" : "决策"}
          </Capsule>
        </div>
        {err ? <div style={{ color: "#d33", fontSize: 12, marginTop: 6 }}>{err}</div> : null}
      </GlassCard>

      {result ? (
        <GlassCard radius={12} className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <RouteFlow result={result} />
          <DetailGrid result={result} />
        </GlassCard>
      ) : null}
    </div>
  );
}

function RouteFlow({ result }: { result: DecisionPreview }) {
  const route = result.would_route;
  const stages: Array<{ key: string; label: string; active: boolean; took: boolean }> = [
    { key: "handoff", label: "规则关键词 handoff", active: route === "handoff", took: route === "handoff" },
    { key: "faq", label: "FAQ 命中", active: route === "faq", took: route === "faq" },
    { key: "rag", label: "RAG 命中", active: route === "rag", took: route === "rag" },
    { key: "llm", label: "LLM 兜底", active: route === "llm_general", took: route === "llm_general" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
      {stages.map((s, i) => (
        <span
          key={s.key}
          style={{
            display: "inline-flex",
            gap: 4,
            alignItems: "center",
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid",
            borderColor: s.took ? "var(--color-primary, #0A84FF)" : "var(--color-border)",
            background: s.took
              ? "color-mix(in srgb, var(--color-primary) 15%, var(--color-surface))"
              : "var(--color-surface)",
            color: s.took ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            fontWeight: s.took ? 600 : 400,
          }}
        >
          {s.took ? "✓ " : i > 0 && stages[i - 1]!.took ? "× " : ""}
          {s.label}
        </span>
      ))}
    </div>
  );
}

function DetailGrid({ result }: { result: DecisionPreview }) {
  const d = result.decision;
  return (
    <table style={{ width: "100%", fontSize: 12, marginTop: 6 }}>
      <tbody>
        <tr>
          <td style={{ width: 110, color: "var(--color-text-tertiary)", padding: "4px 8px 4px 0" }}>action</td>
          <td><strong>{d.action}</strong></td>
        </tr>
        <tr>
          <td style={{ color: "var(--color-text-tertiary)", padding: "4px 8px 4px 0" }}>reason</td>
          <td>{d.reason}</td>
        </tr>
        <tr>
          <td style={{ color: "var(--color-text-tertiary)", padding: "4px 8px 4px 0" }}>confidence</td>
          <td>{d.confidence.toFixed(2)}</td>
        </tr>
        {d.hits.length > 0 ? (
          <tr>
            <td style={{ color: "var(--color-text-tertiary)", padding: "4px 8px 4px 0" }}>hits</td>
            <td>{d.hits.map((h) => <code key={h} style={{ background: "var(--color-surface-alt)", padding: "1px 6px", borderRadius: 4, marginRight: 4, fontSize: 11 }}>{h}</code>)}</td>
          </tr>
        ) : null}
        {result.faq ? (
          <tr>
            <td style={{ color: "var(--color-text-tertiary)", padding: "4px 8px 4px 0" }}>faq</td>
            <td>{result.faq.title} <span style={{ color: "var(--color-text-tertiary)" }}>· how={result.faq.how} · score={result.faq.score?.toFixed(2)}</span></td>
          </tr>
        ) : null}
        {result.rag ? (
          <tr>
            <td style={{ color: "var(--color-text-tertiary)", padding: "4px 8px 4px 0" }}>rag</td>
            <td>{result.rag.top_title} <span style={{ color: "var(--color-text-tertiary)" }}>· score={result.rag.score?.toFixed(2)} · chunks={result.rag.chunk_count}</span></td>
          </tr>
        ) : null}
      </tbody>
    </table>
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
