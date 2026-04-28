import { useEffect, useMemo, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { dashboard, observe, steal, supervisorReport, unobserve } from "../api/client.js";
import type {
  DashboardAgentRow,
  DashboardData,
  DashboardKpi,
  DashboardQueueRow,
} from "../api/types.js";

interface ActiveSessionRow {
  sessionId: string;
  agent: DashboardAgentRow;
  observers: number[];
}

/**
 * 主管视图实时大屏 — 仅 role=SUPERVISOR 时呈现。
 *
 * 上方一排 KPI 卡片;中间左:坐席表(状态/技能组/load);中间右:全队列(reason/等待/VIP)。
 * 数据由 SSE inbox-changed 触发刷新 + 5s 兜底定时拉取。
 */
export function SupervisorDashboard({
  supervisorId,
  onObserveSession,
}: {
  supervisorId: number;
  /** 主管点"监听"会话时,把会话 id 抛给父级跳转 */
  onObserveSession?: (sessionId: string) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handoffReasons, setHandoffReasons] = useState<Array<{ key: string; count: number }>>([]);
  const [toolHealth, setToolHealth] = useState<Array<{ name: string; ok_rate: number; total: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    const refresh = async () => {
      try {
        const [d, h, tools] = await Promise.all([
          dashboard(),
          supervisorReport("handoff", 30).catch(() => ({} as Record<string, unknown>)),
          supervisorReport("tools", 30).catch(() => ({} as Record<string, unknown>)),
        ]);
        if (!cancelled) {
          setData(d);
          setError(null);
          const reasons = (h.by_reason as Array<{ key: string; count: number }>) ?? [];
          setHandoffReasons(reasons);
          const rows = (tools.rows as Array<{ name: string; ok_rate: number; total: number }>) ?? [];
          // 只关注 total>=2 且 ok_rate < 0.85 的
          setToolHealth(rows.filter((r) => r.total >= 2 && r.ok_rate < 0.85));
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };
    void refresh();
    const t = setInterval(refresh, 5000);

    try {
      es = new EventSource(`/v1/agent/events?agent_id=${supervisorId}`);
      es.addEventListener("inbox-changed", () => void refresh());
    } catch {
      // 浏览器不支持 SSE 时,5s 轮询兜底已在
    }

    return () => {
      cancelled = true;
      clearInterval(t);
      es?.close();
    };
  }, [supervisorId]);

  if (error && !data) {
    return (
      <GlassCard
        radius={16}
        style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--color-danger)" }}
      >
        加载失败:{error}
      </GlassCard>
    );
  }
  if (!data) {
    return (
      <GlassCard
        radius={16}
        style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--color-text-tertiary)" }}
      >
        加载中…
      </GlassCard>
    );
  }

  const refreshNow = async () => {
    try {
      const d = await dashboard();
      setData(d);
    } catch (err) {
      console.error("[dashboard refresh]", err);
    }
  };

  const handleObserve = async (sid: string) => {
    try {
      await observe(supervisorId, sid);
      onObserveSession?.(sid);
    } catch (err) {
      console.error("[observe]", err);
    }
  };

  const handleUnobserve = async (sid: string) => {
    try {
      await unobserve(supervisorId, sid);
      await refreshNow();
    } catch (err) {
      console.error("[unobserve]", err);
    }
  };

  const handleSteal = async (sid: string, fromAgentId: number) => {
    try {
      await steal(supervisorId, fromAgentId, sid);
      onObserveSession?.(sid);
      await refreshNow();
    } catch (err) {
      console.error("[steal]", err);
    }
  };

  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 12,
      }}
    >
      <KpiCards kpi={data.kpi} byGroup={data.queue_by_group} />
      <IncidentBanner queue={data.queue} />
      {(handoffReasons.length > 0 || toolHealth.length > 0) ? (
        <FaultsRow reasons={handoffReasons} tools={toolHealth} />
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 12,
          minHeight: 0,
        }}
      >
        <AgentTable agents={data.agents} />
        <QueueTable
          queue={data.queue}
          onObserve={handleObserve}
          onSteal={(sid) => handleSteal(sid, 0)}
        />
        <ActiveSessionsTable
          rows={collectActiveSessions(data.agents)}
          observingSet={observingSelfSessions(data.agents, supervisorId)}
          onObserve={handleObserve}
          onUnobserve={handleUnobserve}
          onSteal={handleSteal}
        />
        <ObservingSelfPanel
          sessions={observingSelfSessions(data.agents, supervisorId)}
          onJump={(sid) => onObserveSession?.(sid)}
          onUnobserve={handleUnobserve}
        />
      </div>
    </div>
  );
}

function collectActiveSessions(agents: DashboardAgentRow[]): ActiveSessionRow[] {
  const out: ActiveSessionRow[] = [];
  // 主管观察其它会话 ≠ 该会话归该主管承接,所以 observers 只从其他坐席的 observing_session_ids 推出
  const observerMap = new Map<string, number[]>();
  for (const a of agents) {
    for (const sid of a.observing_session_ids ?? []) {
      const arr = observerMap.get(sid) ?? [];
      arr.push(a.id);
      observerMap.set(sid, arr);
    }
  }
  for (const a of agents) {
    for (const sid of a.active_session_ids ?? []) {
      out.push({ sessionId: sid, agent: a, observers: observerMap.get(sid) ?? [] });
    }
  }
  return out.sort((x, y) => x.sessionId.localeCompare(y.sessionId));
}

function observingSelfSessions(
  agents: DashboardAgentRow[],
  supervisorId: number,
): string[] {
  const me = agents.find((a) => a.id === supervisorId);
  return me?.observing_session_ids ?? [];
}

// ───── KPI ─────

function KpiCards({
  kpi,
  byGroup,
}: {
  kpi: DashboardKpi;
  byGroup: Record<string, number>;
}) {
  const items: Array<{ label: string; value: string; tone?: "ok" | "warn" | "alert" }> = [
    { label: "队列总数", value: String(kpi.queue_total) },
    {
      label: "VIP 等待",
      value: String(kpi.vip_waiting),
      tone: kpi.vip_waiting > 0 ? "warn" : "ok",
    },
    {
      label: "未成年待处理",
      value: String(kpi.minor_waiting),
      tone: kpi.minor_waiting > 0 ? "alert" : "ok",
    },
    {
      label: "超时积压",
      value: String(kpi.aged_waiting),
      tone: kpi.aged_waiting > 0 ? "alert" : "ok",
    },
    {
      label: "最长等待",
      value: kpi.max_wait_seconds + "s",
      tone: kpi.max_wait_seconds > 60 ? "warn" : "ok",
    },
    { label: "在线坐席", value: `${kpi.agents_idle + kpi.agents_busy + kpi.agents_away}` },
    { label: "空闲 / 忙碌", value: `${kpi.agents_idle} / ${kpi.agents_busy}` },
    {
      label: "负载",
      value: `${kpi.load} / ${kpi.capacity}(${(kpi.load_ratio * 100).toFixed(0)}%)`,
      tone: kpi.load_ratio > 0.85 ? "warn" : "ok",
    },
    { label: "策略", value: kpi.strategy },
  ];
  return (
    <GlassCard
      strength="weak"
      radius={14}
      style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            padding: "8px 10px",
            borderRadius: "var(--radius-button)",
            border: "1px solid var(--color-border)",
            background:
              it.tone === "alert"
                ? "color-mix(in srgb, var(--color-danger) 14%, var(--color-surface))"
                : it.tone === "warn"
                  ? "color-mix(in srgb, var(--color-warning) 14%, var(--color-surface))"
                  : "var(--color-surface)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {it.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{it.value}</div>
        </div>
      ))}
      {Object.keys(byGroup).length > 0 ? (
        <div
          style={{
            gridColumn: "1 / -1",
            paddingTop: 6,
            borderTop: "1px dashed var(--color-border)",
            fontSize: 12,
            color: "var(--color-text-secondary)",
          }}
        >
          按技能组:
          {Object.entries(byGroup).map(([k, v]) => (
            <span
              key={k}
              style={{
                display: "inline-flex",
                gap: 4,
                marginLeft: 10,
                padding: "2px 8px",
                borderRadius: "var(--radius-capsule)",
                background: "var(--bubble-system)",
              }}
            >
              <strong>{k}</strong>
              <span>{v}</span>
            </span>
          ))}
        </div>
      ) : null}
    </GlassCard>
  );
}

// ───── 坐席表 ─────

function AgentTable({ agents }: { agents: DashboardAgentRow[] }) {
  const STATUS_DOT: Record<string, string> = {
    IDLE: "var(--color-success)",
    BUSY: "var(--color-warning)",
    AWAY: "var(--color-text-tertiary)",
    OFFLINE: "var(--color-text-tertiary)",
  };
  return (
    <GlassCard radius={14} style={tableCardStyle}>
      <header style={tableHeaderStyle}>坐席({agents.length})</header>
      <div style={tableBodyStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={tableTrStyle}>
              <th style={thStyle}>状态</th>
              <th style={thStyle}>名称</th>
              <th style={thStyle}>角色</th>
              <th style={thStyle}>技能组</th>
              <th style={thStyle}>负载</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={5} style={emptyTdStyle}>
                  暂无坐席
                </td>
              </tr>
            ) : (
              agents.map((a) => (
                <tr key={a.id}>
                  <td style={tdStyle}>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        marginRight: 6,
                        background: STATUS_DOT[a.status] ?? "var(--color-text-tertiary)",
                      }}
                    />
                    {a.status}
                  </td>
                  <td style={tdStyle}>
                    {a.nickname}
                    {a.role === "SUPERVISOR" ? (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: "var(--radius-capsule)",
                          background:
                            "linear-gradient(135deg, var(--bubble-ai-from), var(--bubble-ai-to))",
                          color: "#FFFFFF",
                        }}
                      >
                        SUP
                      </span>
                    ) : null}
                  </td>
                  <td style={tdStyle}>{a.role}</td>
                  <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>
                    {(a.skill_groups ?? []).join(" · ") || "—"}
                  </td>
                  <td style={tdStyle}>
                    {a.load} / {a.max_concurrency}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ───── 队列表 ─────

function QueueTable({
  queue,
  onObserve,
  onSteal,
}: {
  queue: DashboardQueueRow[];
  onObserve: (sid: string) => void;
  /** 主管直接从队列拉接(steal,from_agent_id=0 表示无前任承接者) */
  onSteal: (sid: string) => void;
}) {
  return (
    <GlassCard radius={14} style={tableCardStyle}>
      <header style={tableHeaderStyle}>排队({queue.length})</header>
      <div style={tableBodyStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={tableTrStyle}>
              <th style={thStyle}>VIP</th>
              <th style={thStyle}>技能组</th>
              <th style={thStyle}>原因</th>
              <th style={thStyle}>等待</th>
              <th style={thStyle}>会话</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyTdStyle}>
                  队列为空
                </td>
              </tr>
            ) : (
              queue.map((q) => (
                <tr key={q.id}>
                  <td style={tdStyle}>{q.vip ? "★" : ""}</td>
                  <td style={tdStyle}>{q.skill_group}</td>
                  <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>
                    {q.reason ?? "—"}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      color:
                        q.waited_seconds > 60
                          ? "var(--color-danger)"
                          : q.waited_seconds > 30
                            ? "var(--color-warning)"
                            : "var(--color-text-secondary)",
                    }}
                  >
                    {q.waited_seconds}s
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {q.session_id.slice(0, 18)}…
                  </td>
                  <td style={{ ...tdStyle, display: "flex", gap: 4 }}>
                    <Capsule size="sm" variant="ghost" onClick={() => onObserve(q.session_id)}>
                      监听
                    </Capsule>
                    <Capsule size="sm" variant="primary" onClick={() => onSteal(q.session_id)}>
                      抢接
                    </Capsule>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ───── 活跃会话表 ─────

function ActiveSessionsTable({
  rows,
  observingSet,
  onObserve,
  onUnobserve,
  onSteal,
}: {
  rows: ActiveSessionRow[];
  observingSet: string[];
  onObserve: (sid: string) => void;
  onUnobserve: (sid: string) => void;
  onSteal: (sid: string, fromAgentId: number) => void;
}) {
  const observingNow = useMemo(() => new Set(observingSet), [observingSet]);
  return (
    <GlassCard radius={14} style={tableCardStyle}>
      <header style={tableHeaderStyle}>
        活跃会话({rows.length})· 我观察中 {observingSet.length}
      </header>
      <div style={tableBodyStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={tableTrStyle}>
              <th style={thStyle}>会话</th>
              <th style={thStyle}>承接坐席</th>
              <th style={thStyle}>主管观察</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={emptyTdStyle}>
                  暂无在岗会话
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const mine = observingNow.has(r.sessionId);
                return (
                  <tr
                    key={r.sessionId}
                    style={
                      mine
                        ? {
                            background:
                              "color-mix(in srgb, var(--color-primary) 8%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {r.sessionId.slice(0, 18)}…
                    </td>
                    <td style={tdStyle}>
                      {r.agent.nickname}{" "}
                      <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>
                        #{r.agent.id} · {r.agent.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>
                      {r.observers.length === 0 ? "—" : r.observers.join(",")}
                    </td>
                    <td style={{ ...tdStyle, display: "flex", gap: 4 }}>
                      {mine ? (
                        <Capsule
                          size="sm"
                          variant="outline"
                          onClick={() => onUnobserve(r.sessionId)}
                        >
                          取消监听
                        </Capsule>
                      ) : (
                        <Capsule
                          size="sm"
                          variant="ghost"
                          onClick={() => onObserve(r.sessionId)}
                        >
                          监听
                        </Capsule>
                      )}
                      <Capsule
                        size="sm"
                        variant="primary"
                        onClick={() => onSteal(r.sessionId, r.agent.id)}
                        title={`从 ${r.agent.nickname} 接走`}
                      >
                        抢接
                      </Capsule>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ───── 当前主管观察列表(快速跳转) ─────

function ObservingSelfPanel({
  sessions,
  onJump,
  onUnobserve,
}: {
  sessions: string[];
  onJump: (sid: string) => void;
  onUnobserve: (sid: string) => void;
}) {
  return (
    <GlassCard radius={14} style={tableCardStyle}>
      <header style={tableHeaderStyle}>我观察中({sessions.length})</header>
      <div style={{ ...tableBodyStyle, padding: 12, display: "flex", flexWrap: "wrap", gap: 6, alignContent: "flex-start" }}>
        {sessions.length === 0 ? (
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
            暂未观察任何会话。从「排队」或「活跃会话」点「监听」。
          </span>
        ) : (
          sessions.map((sid) => (
            <span
              key={sid}
              style={{
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                padding: "4px 8px 4px 10px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-capsule)",
                background:
                  "color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))",
                fontSize: 12,
              }}
            >
              <button
                type="button"
                onClick={() => onJump(sid)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-primary)",
                  padding: 0,
                }}
                title="跳到会话"
              >
                {sid}
              </button>
              <Capsule size="sm" variant="outline" onClick={() => onUnobserve(sid)}>
                ✕
              </Capsule>
            </span>
          ))
        )}
      </div>
    </GlassCard>
  );
}

// ───── 共享样式 ─────

const tableCardStyle: React.CSSProperties = {
  padding: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
const tableHeaderStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-border)",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const tableBodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "var(--font-size-caption)",
};
const tableTrStyle: React.CSSProperties = {
  background: "color-mix(in srgb, var(--color-text-tertiary) 8%, transparent)",
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontWeight: 500,
  color: "var(--color-text-tertiary)",
  fontSize: 11,
  textTransform: "uppercase",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderTop: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};
const emptyTdStyle: React.CSSProperties = {
  padding: 16,
  color: "var(--color-text-tertiary)",
  textAlign: "center",
};

// ───── 赛事预警 banner ─────

function IncidentBanner({ queue }: { queue: DashboardQueueRow[] }) {
  const byGroup = useMemo(() => {
    const m = new Map<string, number>();
    queue.forEach((q) => m.set(q.skill_group, (m.get(q.skill_group) ?? 0) + 1));
    return m;
  }, [queue]);
  const hot: Array<{ skillGroup: string; count: number }> = [];
  byGroup.forEach((count, skillGroup) => {
    if (count >= 3) hot.push({ skillGroup, count });
  });
  if (hot.length === 0) return null;
  hot.sort((a, b) => b.count - a.count);
  return (
    <GlassCard
      strength="weak"
      radius={12}
      style={{
        padding: "10px 14px",
        background: "color-mix(in srgb, var(--color-danger) 12%, var(--color-surface))",
        border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <strong style={{ fontSize: 14 }}>⚠ 赛事/故障预警</strong>
      <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
        以下技能组排队 ≥ 3,可能赛事直播 / 区域故障:
      </span>
      {hot.map((h) => (
        <span
          key={h.skillGroup}
          style={{
            padding: "3px 10px",
            borderRadius: "var(--radius-capsule)",
            background: "var(--color-danger)",
            color: "#fff",
            fontSize: 12,
          }}
        >
          {h.skillGroup} · {h.count}
        </span>
      ))}
    </GlassCard>
  );
}

// ───── 故障 TopN ─────

function FaultsRow({
  reasons,
  tools,
}: {
  reasons: Array<{ key: string; count: number }>;
  tools: Array<{ name: string; ok_rate: number; total: number }>;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <GlassCard radius={12} style={{ padding: 12 }}>
        <header
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 6,
          }}
        >
          转人工原因 TopN(近 30 分钟)
        </header>
        {reasons.length === 0 ? (
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>暂无</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {reasons.slice(0, 5).map((r) => (
              <div
                key={r.key}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <span style={{ minWidth: 110 }}>{r.key}</span>
                <div style={{ flex: 1, height: 6, background: "var(--color-surface-alt)", borderRadius: 3 }}>
                  <div
                    style={{
                      width: `${Math.min(100, (r.count / Math.max(1, reasons[0]!.count)) * 100)}%`,
                      height: "100%",
                      background: "var(--color-danger)",
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span style={{ width: 28, textAlign: "right" }}>{r.count}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
      <GlassCard radius={12} style={{ padding: 12 }}>
        <header
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 6,
          }}
        >
          工具失败率告警(近 30 分钟,ok_rate &lt; 85%)
        </header>
        {tools.length === 0 ? (
          <span style={{ color: "var(--color-success)", fontSize: 12 }}>✓ 全部工具健康</span>
        ) : (
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 4 }}>工具</th>
                <th style={{ textAlign: "right", padding: 4 }}>调用</th>
                <th style={{ textAlign: "right", padding: 4 }}>成功率</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.name}>
                  <td style={{ padding: 4 }}>{t.name}</td>
                  <td style={{ padding: 4, textAlign: "right" }}>{t.total}</td>
                  <td
                    style={{
                      padding: 4,
                      textAlign: "right",
                      color: t.ok_rate < 0.5 ? "var(--color-danger)" : "var(--color-warning)",
                      fontWeight: 600,
                    }}
                  >
                    {(t.ok_rate * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
}
