import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import type { AgentInfo, AgentStatus } from "../api/types.js";

const STATUSES: { v: AgentStatus; label: string; color: string }[] = [
  { v: "IDLE", label: "空闲", color: "var(--color-success)" },
  { v: "BUSY", label: "忙碌", color: "var(--color-warning)" },
  { v: "AWAY", label: "暂离", color: "var(--color-text-tertiary)" },
  { v: "OFFLINE", label: "离线", color: "var(--color-text-tertiary)" },
];

export interface StatusBarProps {
  agent: AgentInfo | null;
  onSetStatus: (s: AgentStatus) => void;
  loadCount: number;
  waitingCount: number;
}

export function StatusBar({ agent, onSetStatus, loadCount, waitingCount }: StatusBarProps) {
  const cur = agent?.status ?? "OFFLINE";
  const dot = STATUSES.find((s) => s.v === cur)?.color ?? "var(--color-text-tertiary)";

  return (
    <GlassCard
      strength="weak"
      ring={false}
      radius={14}
      style={{
        margin: "12px 12px 0",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        height: 44,
      }}
    >
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: dot }} />
      <span style={{ fontWeight: 600 }}>
        {agent?.nickname ?? `坐席 #${agent?.id ?? "—"}`}
      </span>
      <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--font-size-caption)" }}>
        {agent?.skillGroups?.join(" · ") ?? "无技能组"}
      </span>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
        {STATUSES.map((s) => (
          <Capsule
            key={s.v}
            size="sm"
            variant={cur === s.v ? "primary" : "ghost"}
            onClick={() => onSetStatus(s.v)}
          >
            {s.label}
          </Capsule>
        ))}
      </span>
      <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)" }}>
        队列 {waitingCount} · 进行中 {loadCount}/{agent?.maxConcurrency ?? 5}
      </span>
    </GlassCard>
  );
}
