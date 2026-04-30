import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  accept,
  deviceHeartbeat,
  deviceRelease,
  inbox,
  register,
  setStatus,
} from "./api/client.js";
import type { AgentInfo, AgentStatus, HandoffPacket, InboxResponse, QueueEntry, SessionView } from "./api/types.js";
import { ContextPanel } from "./components/ContextPanel.js";
import { ConversationView } from "./components/ConversationView.js";
import { SessionList } from "./components/SessionList.js";
import { StatusBar } from "./components/StatusBar.js";
import { AiInboxPanel } from "./components/AiInboxPanel.js";
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
  const [view, setView] = useState<"console" | "ai-inbox" | "dashboard">("console");
  const [evicted, setEvicted] = useState(false);
  const deviceIdRef = useRef<string>(getOrCreateDeviceId());
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

      // 同坐席多 Tab 互锁:启动 + 5s 心跳;evicted 时关停一切
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const sendHeartbeat = async () => {
        try {
          const r = await deviceHeartbeat(cfg.agentId, deviceIdRef.current);
          if (r.evicted && r.holder !== deviceIdRef.current) {
            // 自己被抢走了(理论上不会进这里 — 因为 heartbeat 时我们写的是自己;
            // 留兜底)
            setEvicted(true);
          }
        } catch {
          /* ignore */
        }
      };
      void sendHeartbeat();
      heartbeatTimer = setInterval(sendHeartbeat, 5000);

      // 优先 SSE,失败自动降级到 8s 轮询
      try {
        es = new EventSource(`/v1/agent/events?agent_id=${cfg.agentId}`);
        es.addEventListener("inbox-changed", () => void refresh());
        es.addEventListener("hello", () => void refresh());
        es.addEventListener("device-evicted", (ev) => {
          try {
            const data = JSON.parse((ev as MessageEvent).data) as { evicted_device?: string };
            if (data.evicted_device === deviceIdRef.current) {
              setEvicted(true);
              if (heartbeatTimer) clearInterval(heartbeatTimer);
              es?.close();
            }
          } catch {
            /* ignore */
          }
        });
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
      // 离开页面时主动 release(同 device 才生效),避免新 Tab 进来还要等 TTL
      void deviceRelease(cfg.agentId, deviceIdRef.current);
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

  if (evicted) {
    return (
      <div
        style={{
          height: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          textAlign: "center",
          background: "color-mix(in srgb, var(--color-danger) 8%, var(--color-surface))",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>⚠ 此 Tab 已被另一设备登录顶下</h2>
          <p style={{ color: "var(--color-text-secondary)", marginTop: 8 }}>
            为防止同会话被两个设备双发,旧 Tab 已断开。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              background: "var(--color-surface)",
              cursor: "pointer",
            }}
          >
            重新接管(关闭其它 Tab 后)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <StatusBar
        agent={agent}
        loadCount={agent?.activeSessionIds?.length ?? 0}
        waitingCount={waiting.length}
        onSetStatus={onSetStatus}
      />
      <ViewTabs view={view} onChange={setView} isSupervisor={isSupervisor} />
      {view === "ai-inbox" ? (
        <div style={{ flex: 1, padding: 12, overflow: "hidden" }}>
          <AiInboxPanel agentId={cfg.agentId} />
        </div>
      ) : isSupervisor && view === "dashboard" ? (
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

function getOrCreateDeviceId(): string {
  // 用 sessionStorage 而不是 localStorage,新 Tab 必拿新 device 才能走互斥语义
  const k = "aikefu.device.id";
  try {
    const cur = sessionStorage.getItem(k);
    if (cur) return cur;
    const id =
      "dev-" +
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
    sessionStorage.setItem(k, id);
    return id;
  } catch {
    return "dev-" + Date.now().toString(36);
  }
}

type ViewKey = "console" | "ai-inbox" | "dashboard";

function ViewTabs({
  view,
  onChange,
  isSupervisor,
}: {
  view: ViewKey;
  onChange: (v: ViewKey) => void;
  isSupervisor: boolean;
}) {
  const items: Array<{ k: ViewKey; label: string }> = [
    { k: "console", label: "工作台" },
    { k: "ai-inbox", label: "AI 托管中" },
  ];
  if (isSupervisor) items.push({ k: "dashboard", label: "主管视图" });
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
