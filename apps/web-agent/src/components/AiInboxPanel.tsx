import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { listAiSessions, steal, type AiSessionRow } from "../api/client.js";
import { ConversationView } from "./ConversationView.js";

/**
 * AI 托管会话板块 — 列出 status=ai 的全部会话,点开看历史(只读),
 * 必要时坐席可点「接管」从 AI 抢过来(走 supervisor.steal 通用逻辑,
 * from_agent_id=0 表示当前没人接)。
 */
export function AiInboxPanel({ agentId }: { agentId: number }) {
  const [rows, setRows] = useState<AiSessionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    listAiSessions(100)
      .then(setRows)
      .catch((e: unknown) => setErr((e as Error).message));
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const onSteal = async (sid: string) => {
    setBusyId(sid);
    try {
      await steal(agentId, 0, sid);
      setSelected(null);
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, height: "100%" }}>
      <GlassCard
        radius={14}
        style={{ padding: 12, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontSize: 14 }}>AI 托管中({rows.length})</strong>
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>5s 自动刷新</span>
          <Capsule
            size="sm"
            variant="ghost"
            onClick={() => refresh()}
            style={{ marginLeft: "auto" }}
          >
            刷新
          </Capsule>
        </div>
        {err ? <div style={{ color: "#d33", fontSize: 12 }}>{err}</div> : null}
        {rows.length === 0 ? (
          <div style={{ color: "var(--color-text-tertiary)", fontSize: 12, padding: 8 }}>
            暂无 AI 托管会话
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {rows.map((r) => {
              const lc = (r.liveContext ?? {}) as Record<string, unknown>;
              const scene = String(lc.scene ?? "—");
              const room = lc.room_id ?? lc.vod_id ?? "";
              const isSelected = selected === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid",
                      borderColor: isSelected ? "var(--color-primary, #0A84FF)" : "transparent",
                      background: isSelected ? "var(--color-surface-alt)" : "transparent",
                      cursor: "pointer",
                      color: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                      {r.id.slice(0, 22)}…
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                      {scene}
                      {room ? ` · #${room}` : ""}
                      {r.startedAt ? ` · ${new Date(r.startedAt).toLocaleTimeString()}` : ""}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      <ConversationView
        agentId={agentId}
        sessionId={selected}
        readOnly
        extraActions={
          selected ? (
            <Capsule
              size="sm"
              variant="primary"
              onClick={() => void onSteal(selected)}
              disabled={busyId === selected}
            >
              {busyId === selected ? "接管中…" : "接管"}
            </Capsule>
          ) : null
        }
        onAfterAction={refresh}
      />
    </div>
  );
}
