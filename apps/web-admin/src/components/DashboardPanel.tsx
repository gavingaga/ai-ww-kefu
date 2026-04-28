import { useEffect, useState } from "react";

import { GlassCard } from "@ai-kefu/ui-glass";

import { dashboard } from "../api/client.js";
import type {
  DashboardAgentRow,
  DashboardData,
  DashboardKpi,
  DashboardQueueRow,
} from "../api/types.js";

/**
 * 运营看板 — /v1/admin/dashboard 透传到 routing-svc /v1/dashboard。
 *
 * 5 秒自动刷新。布局:KPI 卡片网格 → (坐席表 | 队列表)。
 */
export function DashboardPanel() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tickAt, setTickAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const d = await dashboard();
        if (!cancelled) {
          setData(d);
          setErr(null);
          setTickAt(Date.now());
        }
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message);
      }
    };
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (err && !data) {
    return (
      <div className="admin-layout">
        <GlassCard radius={12} className="admin-card" style={{ color: "#d33" }}>
          加载失败:{err}
        </GlassCard>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="admin-layout">
        <GlassCard radius={12} className="admin-card" style={{ color: "var(--color-text-tertiary)" }}>
          加载中…
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>运营看板</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          GET /v1/admin/dashboard → routing-svc(5s 自动刷新)
        </span>
        {tickAt ? (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-tertiary)" }}>
            最近刷新 {new Date(tickAt).toLocaleTimeString()}
          </span>
        ) : null}
      </header>

      <KpiGrid kpi={data.kpi} byGroup={data.queue_by_group} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        <AgentTable agents={data.agents} />
        <QueueTable queue={data.queue} />
      </div>
    </div>
  );
}

function KpiGrid({ kpi, byGroup }: { kpi: DashboardKpi; byGroup: Record<string, number> }) {
  const items: Array<{ label: string; value: string; tone?: "ok" | "warn" | "alert" }> = [
    { label: "队列总数", value: String(kpi.queue_total) },
    { label: "VIP 等待", value: String(kpi.vip_waiting), tone: kpi.vip_waiting > 0 ? "warn" : "ok" },
    { label: "未成年", value: String(kpi.minor_waiting), tone: kpi.minor_waiting > 0 ? "alert" : "ok" },
    { label: "超时积压", value: String(kpi.aged_waiting), tone: kpi.aged_waiting > 0 ? "alert" : "ok" },
    { label: "最长等待", value: kpi.max_wait_seconds + "s", tone: kpi.max_wait_seconds > 60 ? "warn" : "ok" },
    { label: "在线坐席", value: String(kpi.agents_idle + kpi.agents_busy + kpi.agents_away) },
    { label: "空闲 / 忙碌", value: `${kpi.agents_idle} / ${kpi.agents_busy}` },
    { label: "主管", value: String(kpi.supervisors) },
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
      radius={12}
      className="admin-card"
      style={{
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
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: toneBg(it.tone),
          }}
        >
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
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
                borderRadius: 999,
                background: "var(--color-surface-alt)",
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

function AgentTable({ agents }: { agents: DashboardAgentRow[] }) {
  const STATUS_DOT: Record<string, string> = {
    IDLE: "#0a7",
    BUSY: "#e69",
    AWAY: "var(--color-text-tertiary)",
    OFFLINE: "var(--color-text-tertiary)",
  };
  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>坐席({agents.length})</strong>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th>状态</th>
            <th>名称</th>
            <th>角色</th>
            <th>技能组</th>
            <th className="num">负载</th>
            <th>会话</th>
          </tr>
        </thead>
        <tbody>
          {agents.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 12 }}>
                暂无坐席
              </td>
            </tr>
          ) : (
            agents.map((a) => (
              <tr key={a.id}>
                <td>
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
                <td>
                  {a.nickname}
                  {a.role === "SUPERVISOR" ? (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: "var(--color-surface-alt)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      SUP
                    </span>
                  ) : null}
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    #{a.id}
                  </span>
                </td>
                <td>{a.role}</td>
                <td style={{ color: "var(--color-text-secondary)" }}>
                  {(a.skill_groups ?? []).join(" · ") || "—"}
                </td>
                <td className="num">
                  {a.load} / {a.max_concurrency}
                </td>
                <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "var(--color-text-secondary)" }}>
                  {a.active_session_ids.length === 0
                    ? "—"
                    : a.active_session_ids.map((s) => s.slice(0, 10)).join(" · ")}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </GlassCard>
  );
}

function QueueTable({ queue }: { queue: DashboardQueueRow[] }) {
  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>排队({queue.length})</strong>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th>VIP</th>
            <th>技能组</th>
            <th>原因</th>
            <th className="num">等待</th>
            <th>会话</th>
            <th>摘要</th>
          </tr>
        </thead>
        <tbody>
          {queue.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 12 }}>
                队列为空
              </td>
            </tr>
          ) : (
            queue.map((q) => (
              <tr
                key={q.id}
                style={
                  q.overflowed
                    ? { background: "color-mix(in srgb, #f33 8%, transparent)" }
                    : undefined
                }
              >
                <td>{q.vip ? "★" : ""}</td>
                <td>{q.skill_group}</td>
                <td style={{ color: "var(--color-text-secondary)" }}>{q.reason ?? "—"}</td>
                <td
                  className="num"
                  style={{
                    color:
                      q.waited_seconds > 60
                        ? "#d33"
                        : q.waited_seconds > 30
                          ? "#e80"
                          : "var(--color-text-secondary)",
                  }}
                >
                  {q.waited_seconds}s
                </td>
                <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>
                  {q.session_id.slice(0, 18)}…
                </td>
                <td style={{ color: "var(--color-text-secondary)", maxWidth: 280 }}>
                  {(q.summary ?? "").slice(0, 80) || "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </GlassCard>
  );
}

function toneBg(tone?: "ok" | "warn" | "alert"): string {
  if (tone === "alert") return "color-mix(in srgb, #f33 14%, var(--color-surface))";
  if (tone === "warn") return "color-mix(in srgb, #fc0 14%, var(--color-surface))";
  return "var(--color-surface)";
}
