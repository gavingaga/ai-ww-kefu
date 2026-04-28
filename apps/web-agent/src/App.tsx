import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { accept, inbox, register, setStatus } from "./api/client.js";
import type { AgentInfo, AgentStatus, HandoffPacket, InboxResponse, QueueEntry, SessionView } from "./api/types.js";
import { ContextPanel } from "./components/ContextPanel.js";
import { ConversationView } from "./components/ConversationView.js";
import { SessionList } from "./components/SessionList.js";
import { StatusBar } from "./components/StatusBar.js";
import { SupervisorDashboard } from "./components/SupervisorDashboard.js";

/**
 * 座席工作台入口 — 三栏:左会话列表 / 中消息 / 右上下文。
 *
 * M3 起步:
 *  - 用 X-Agent-Id 头识别坐席;首次进入自动注册 demo 坐席(可由 query 改 id/nickname/skill_groups)
 *  - 列表轮询 /v1/agent/inbox(后续接 WS 推)
 *  - 选中 active 会话时,从 packet 缓存里取 HandoffPacket;接受 waiting 时把 packet 存入缓存
 */

interface QueryConfig {
  agentId: number;
  nickname: string;
  skillGroups: string[];
  role: "AGENT" | "SUPERVISOR";
}

function readQueryConfig(): QueryConfig {
  const url = new URL(window.location.href);
  const agentId = Number(url.searchParams.get("agent_id") ?? 1);
  const nickname = url.searchParams.get("nickname") ?? `坐席${agentId}`;
  const skillGroups =
    url.searchParams.get("skill_groups")?.split(",").map((s) => s.trim()).filter(Boolean) ??
    ["general", "play_tech", "membership_payment"];
  const role =
    (url.searchParams.get("role") ?? "AGENT").toUpperCase() === "SUPERVISOR"
      ? "SUPERVISOR"
      : "AGENT";
  return { agentId, nickname, skillGroups, role };
}

export function App() {
  const cfg = useMemo(readQueryConfig, []);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [waiting, setWaiting] = useState<QueueEntry[]>([]);
  const [active, setActive] = useState<SessionView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"console" | "dashboard">("console");
  const packetMap = useRef<Map<string, HandoffPacket>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const r: InboxResponse = await inbox(cfg.agentId);
      setAgent(r.agent ?? null);
      setWaiting(r.waiting ?? []);
      setActive(r.active ?? []);
    } catch (err) {
      console.error("[inbox]", err);
    }
  }, [cfg.agentId]);

  // 启动:注册 + 进入 IDLE + 拉一次 inbox + 启动轮询
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      try {
        const a = await register({
          id: cfg.agentId,
          nickname: cfg.nickname,
          skillGroups: cfg.skillGroups,
          maxConcurrency: 5,
          role: cfg.role,
        });
        if (!cancelled) setAgent(a);
        const idle = await setStatus(cfg.agentId, "IDLE");
        if (!cancelled) setAgent(idle);
        await refresh();
      } catch (err) {
        console.error("[init]", err);
      }

      // 优先 SSE,失败自动降级到 8s 轮询
      try {
        es = new EventSource(`/v1/agent/events?agent_id=${cfg.agentId}`);
        es.addEventListener("inbox-changed", () => void refresh());
        es.addEventListener("hello", () => void refresh());
        es.onerror = () => {
          if (cancelled) return;
          console.warn("[sse] error, fallback to polling 8s");
          es?.close();
          es = null;
          if (!fallbackTimer) fallbackTimer = setInterval(refresh, 8000);
        };
      } catch (err) {
        console.warn("[sse] not supported, polling instead", err);
        fallbackTimer = setInterval(refresh, 8000);
      }
    };
    init();
    return () => {
      cancelled = true;
      if (es) es.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [cfg.agentId, cfg.nickname, cfg.skillGroups, refresh]);

  const onSetStatus = async (s: AgentStatus) => {
    try {
      const a = await setStatus(cfg.agentId, s);
      setAgent(a);
    } catch (err) {
      console.error("[setStatus]", err);
    }
  };

  const onAccept = async (q: QueueEntry) => {
    try {
      await accept(cfg.agentId, q.id);
      if (q.packet) packetMap.current.set(q.sessionId, q.packet);
      setSelected(q.sessionId);
      await refresh();
    } catch (err) {
      console.error("[accept]", err);
    }
  };

  const selectedPacket = selected ? packetMap.current.get(selected) ?? null : null;
  const selectedSession = active.find((s) => s.id === selected) ?? null;
  const isSupervisor = cfg.role === "SUPERVISOR";

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <StatusBar
        agent={agent}
        loadCount={agent?.activeSessionIds?.length ?? 0}
        waitingCount={waiting.length}
        onSetStatus={onSetStatus}
      />
      {isSupervisor ? (
        <ViewTabs view={view} onChange={setView} />
      ) : null}
      {isSupervisor && view === "dashboard" ? (
        <div style={{ flex: 1, padding: 12, overflow: "hidden" }}>
          <SupervisorDashboard
            supervisorId={cfg.agentId}
            onObserveSession={(sid) => {
              setView("console");
              setSelected(sid);
            }}
          />
        </div>
      ) : (
        <div className="console-grid">
          <SessionList
            waiting={waiting}
            active={active}
            selectedSessionId={selected}
            onAccept={onAccept}
            onSelect={setSelected}
          />
          <ConversationView
            agentId={cfg.agentId}
            sessionId={selected}
            onAfterAction={() => {
              setSelected(null);
              void refresh();
            }}
            suggestedReplies={selectedPacket?.suggested_replies}
          />
          <ContextPanel
            packet={selectedPacket}
            liveContext={
              (selectedSession?.liveContext as Record<string, unknown> | undefined) ?? null
            }
            agent={agent}
            fromAgentId={cfg.agentId}
            sessionId={selected}
            onAfterAction={() => {
              void refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}

function ViewTabs({
  view,
  onChange,
}: {
  view: "console" | "dashboard";
  onChange: (v: "console" | "dashboard") => void;
}) {
  const items: Array<{ k: "console" | "dashboard"; label: string }> = [
    { k: "console", label: "工作台" },
    { k: "dashboard", label: "主管视图" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 6,
        padding: "0 12px",
        marginTop: 4,
      }}
    >
      {items.map((it) => (
        <button
          key={it.k}
          onClick={() => onChange(it.k)}
          style={{
            padding: "6px 16px",
            border: "1px solid var(--color-border)",
            borderBottom: view === it.k ? "1px solid transparent" : "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
            background: view === it.k ? "var(--color-surface)" : "transparent",
            cursor: "pointer",
            fontWeight: view === it.k ? 600 : 400,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-text-primary)",
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
