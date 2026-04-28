import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { dashboard, observe } from "../api/client.js";
import type {
  DashboardAgentRow,
  DashboardData,
  DashboardKpi,
  DashboardQueueRow,
} from "../api/types.js";

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

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    const refresh = async () => {
      try {
        const d = await dashboard();
        if (!cancelled) {
          setData(d);
          setError(null);
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

  const handleObserve = async (sid: string) => {
    try {
      await observe(supervisorId, sid);
      onObserveSession?.(sid);
    } catch (err) {
      console.error("[observe]", err);
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          minHeight: 0,
        }}
      >
        <AgentTable agents={data.agents} />
        <QueueTable queue={data.queue} onObserve={handleObserve} />
      </div>
    </div>
  );
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
}: {
  queue: DashboardQueueRow[];
  onObserve: (sid: string) => void;
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
                  <td style={tdStyle}>
                    <Capsule size="sm" variant="ghost" onClick={() => onObserve(q.session_id)}>
                      监听
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
