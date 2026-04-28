import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { listSupervisors, steal, transfer, whisper } from "../api/client.js";
import type { AgentInfo } from "../api/types.js";

/**
 * 主管干预按钮区(T-302):转接 / 抢接(主管)/ 插话(主管)。
 * - 普通坐席只显示"转接给主管"
 * - 主管角色显示"抢接 / 插话"
 */
export function SupervisorActions({
  agent,
  fromAgentId,
  sessionId,
  onAfterAction,
}: {
  agent: AgentInfo | null;
  fromAgentId: number;
  sessionId: string;
  onAfterAction: () => void;
}) {
  const [sups, setSups] = useState<AgentInfo[]>([]);
  const [whisperText, setWhisperText] = useState("");
  const isSupervisor = (agent as AgentInfo & { role?: string })?.role === "SUPERVISOR";

  useEffect(() => {
    listSupervisors()
      .then((s) => setSups(s ?? []))
      .catch(() => setSups([]));
  }, []);

  const transferTo = async (toId: number) => {
    if (toId === fromAgentId) return;
    try {
      await transfer(fromAgentId, toId, sessionId);
      onAfterAction();
    } catch (err) {
      console.error("[transfer]", err);
    }
  };

  const stealNow = async () => {
    try {
      await steal(fromAgentId, 0, sessionId);
      onAfterAction();
    } catch (err) {
      console.error("[steal]", err);
    }
  };

  const sendWhisper = async () => {
    const t = whisperText.trim();
    if (!t) return;
    try {
      await whisper(fromAgentId, sessionId, t);
      setWhisperText("");
    } catch (err) {
      console.error("[whisper]", err);
    }
  };

  return (
    <GlassCard
      strength="weak"
      radius={12}
      style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <header style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-tertiary)" }}>
        {isSupervisor ? "主管干预" : "需要协助"}
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {sups.length === 0 ? (
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>暂无在线主管</span>
        ) : (
          sups.map((s) => (
            <Capsule
              key={s.id}
              size="sm"
              variant="ghost"
              onClick={() => transferTo(s.id)}
              disabled={s.id === fromAgentId}
              title={s.id === fromAgentId ? "不能转给自己" : "转给该主管"}
            >
              转 → {s.nickname ?? `#${s.id}`}
            </Capsule>
          ))
        )}
      </div>

      {isSupervisor ? (
        <>
          <div style={{ display: "flex", gap: 6 }}>
            <Capsule size="sm" variant="primary" onClick={stealNow}>
              抢接
            </Capsule>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={whisperText}
              onChange={(e) => setWhisperText(e.target.value)}
              placeholder="对坐席与用户都可见的系统插话"
              style={{
                flex: 1,
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-capsule)",
                padding: "4px 12px",
                background: "var(--color-surface-alt)",
                fontSize: 12,
                color: "var(--color-text-primary)",
                outline: "none",
              }}
            />
            <Capsule
              size="sm"
              variant="outline"
              onClick={sendWhisper}
              disabled={!whisperText.trim()}
            >
              插话
            </Capsule>
          </div>
        </>
      ) : null}
    </GlassCard>
  );
}
