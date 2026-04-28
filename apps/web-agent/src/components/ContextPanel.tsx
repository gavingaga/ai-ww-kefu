import { GlassCard } from "@ai-kefu/ui-glass";

import type { HandoffPacket } from "../api/types.js";

export interface ContextPanelProps {
  packet: HandoffPacket | null;
  liveContext: Record<string, unknown> | null;
}

/** 右侧上下文栏 — Handoff Packet + 直播 / 点播 业务上下文。 */
export function ContextPanel({ packet, liveContext }: ContextPanelProps) {
  return (
    <GlassCard
      strength="base"
      radius={16}
      style={{
        height: "100%",
        padding: 12,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Section title="转人工接力包">
        {packet ? <PacketView packet={packet} /> : <Empty text="尚未接入会话或无转人工记录" />}
      </Section>

      <Section title="直播 / 点播 上下文">
        {liveContext ? (
          <KV obj={liveContext} />
        ) : (
          <Empty text="无 live_context 信息" />
        )}
      </Section>
    </GlassCard>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <header
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 6,
        }}
      >
        {title}
      </header>
      <div>{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ color: "var(--color-text-tertiary)", fontSize: "var(--font-size-caption)" }}>
      {text}
    </div>
  );
}

function PacketView({ packet }: { packet: HandoffPacket }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Row label="原因" value={packet.reason} />
      <Row label="技能组" value={packet.skill_group_hint ?? "-"} />
      {packet.user ? <KV obj={packet.user as Record<string, unknown>} title="用户" /> : null}
      {packet.entities ? <KV obj={packet.entities as Record<string, unknown>} title="实体" /> : null}
      {packet.summary ? (
        <div>
          <strong style={{ fontSize: "var(--font-size-caption)" }}>摘要</strong>
          <p style={{ margin: "4px 0", color: "var(--color-text-primary)" }}>{packet.summary}</p>
        </div>
      ) : null}
      {packet.history && packet.history.length > 0 ? (
        <details>
          <summary style={{ cursor: "pointer", fontSize: "var(--font-size-caption)" }}>
            最近对话({packet.history.length})
          </summary>
          <ol
            style={{
              padding: "6px 14px",
              margin: 0,
              fontSize: 12,
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {packet.history.map((h, i) => (
              <li key={i}>
                <strong>{h.role}</strong>: {h.content}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: "var(--font-size-caption)" }}>
      <span style={{ color: "var(--color-text-tertiary)", minWidth: 60 }}>{label}</span>
      <span>{value ?? "-"}</span>
    </div>
  );
}

function KV({ obj, title }: { obj: Record<string, unknown>; title?: string }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <Empty text={title ? `${title} 为空` : "(空)"} />;
  }
  return (
    <div>
      {title ? (
        <strong style={{ fontSize: "var(--font-size-caption)" }}>{title}</strong>
      ) : null}
      <table style={{ width: "100%", fontSize: 12, marginTop: title ? 4 : 0 }}>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td
                style={{
                  color: "var(--color-text-tertiary)",
                  padding: "2px 6px 2px 0",
                  verticalAlign: "top",
                }}
              >
                {k}
              </td>
              <td style={{ padding: "2px 0", wordBreak: "break-all" }}>{stringify(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
