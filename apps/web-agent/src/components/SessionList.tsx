import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import type { QueueEntry, SessionView } from "../api/types.js";

export interface SessionListProps {
  waiting: QueueEntry[];
  active: SessionView[];
  selectedSessionId: string | null;
  onAccept: (entry: QueueEntry) => void;
  onSelect: (sessionId: string) => void;
}

export function SessionList({
  waiting,
  active,
  selectedSessionId,
  onAccept,
  onSelect,
}: SessionListProps) {
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
      <Section title={`待接入(${waiting.length})`}>
        {waiting.length === 0 ? (
          <Empty text="暂无等待用户" />
        ) : (
          waiting.map((q) => <WaitingItem key={q.id} q={q} onAccept={() => onAccept(q)} />)
        )}
      </Section>

      <Section title={`进行中(${active.length})`}>
        {active.length === 0 ? (
          <Empty text="还没接入会话" />
        ) : (
          active.map((s) => (
            <ActiveItem
              key={s.id}
              s={s}
              selected={s.id === selectedSessionId}
              onSelect={() => onSelect(s.id)}
            />
          ))
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
          padding: "0 4px 6px",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "12px 4px",
        color: "var(--color-text-tertiary)",
        fontSize: "var(--font-size-caption)",
      }}
    >
      {text}
    </div>
  );
}

function WaitingItem({ q, onAccept }: { q: QueueEntry; onAccept: () => void }) {
  const reason = String(q.packet?.reason ?? "user_request");
  const summary = (q.packet?.summary ?? "(等待中)") as string;
  const isVip = String(
    (q.packet?.user as Record<string, unknown> | undefined)?.["level"] ?? "",
  )
    .toLowerCase()
    .startsWith("vip");
  return (
    <div
      style={{
        padding: 10,
        borderRadius: "var(--radius-button)",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface-alt)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <strong style={{ fontSize: "var(--font-size-caption)" }}>{q.skillGroup}</strong>
        <span
          style={{
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            background: "var(--bubble-system)",
            padding: "1px 6px",
            borderRadius: "var(--radius-capsule)",
          }}
        >
          {reason}
        </span>
        {isVip ? (
          <span
            style={{
              fontSize: 11,
              color: "#FFFFFF",
              background:
                "linear-gradient(135deg, var(--bubble-ai-from), var(--bubble-ai-to))",
              padding: "1px 8px",
              borderRadius: "var(--radius-capsule)",
            }}
          >
            VIP
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-text-secondary)",
          maxHeight: 48,
          overflow: "hidden",
        }}
      >
        {summary}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Capsule size="sm" variant="primary" onClick={onAccept}>
          接入
        </Capsule>
      </div>
    </div>
  );
}

function ActiveItem({
  s,
  selected,
  onSelect,
}: {
  s: SessionView;
  selected: boolean;
  onSelect: () => void;
}) {
  const ctx = (s.liveContext ?? {}) as Record<string, unknown>;
  const scene = String(ctx.scene ?? "");
  const room = ctx.room_id ?? ctx.vod_id ?? "";
  return (
    <button
      onClick={onSelect}
      style={{
        textAlign: "left",
        padding: 10,
        borderRadius: "var(--radius-button)",
        border: "1px solid var(--color-border)",
        background: selected
          ? "color-mix(in srgb, var(--color-primary) 14%, var(--color-surface))"
          : "var(--color-surface)",
        color: "var(--color-text-primary)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: "var(--font-size-caption)" }}>{s.id}</span>
      <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
        {scene || "—"} {room ? `· #${room}` : ""}
      </span>
    </button>
  );
}
