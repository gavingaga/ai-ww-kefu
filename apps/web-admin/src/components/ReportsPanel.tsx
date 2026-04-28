import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { report } from "../api/client.js";
import type { ReportKpi } from "../api/types.js";

interface RouteRow {
  name?: string;
  agent_id?: string;
  total: number;
  ok_rate?: number;
  avg_ms?: number;
  accept?: number;
  close?: number;
  transfer?: number;
  whisper?: number;
}

/**
 * 运营报表 — 调 /v1/admin/report/{kpi,csat,tools,agents,handoff,timeseries}。
 * 5s 自动刷新;窗口可调。
 */
export function ReportsPanel() {
  const [windowMin, setWindowMin] = useState(60);
  const [kpi, setKpi] = useState<ReportKpi | null>(null);
  const [csat, setCsat] = useState<{
    rating_distribution: Record<string, number>;
    top_tags: Array<{ key: string; count: number }>;
  } | null>(null);
  const [tools, setTools] = useState<{ rows: RouteRow[] } | null>(null);
  const [agents, setAgents] = useState<{ rows: RouteRow[] } | null>(null);
  const [handoff, setHandoff] = useState<{ by_reason: Array<{ key: string; count: number }> } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [k, c, t, a, h] = await Promise.all([
        report("kpi", windowMin),
        report("csat", windowMin),
        report("tools", windowMin),
        report("agents", windowMin),
        report("handoff", windowMin),
      ]);
      setKpi(k as unknown as ReportKpi);
      setCsat(c as unknown as typeof csat);
      setTools(t as unknown as typeof tools);
      setAgents(a as unknown as typeof agents);
      setHandoff(h as unknown as typeof handoff);
      setErr(null);
    } catch (e: unknown) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMin]);

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>运营报表</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          /v1/admin/report/* → report-svc(5s 自动刷新)
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          {[15, 60, 240, 1440].map((w) => (
            <Capsule
              key={w}
              size="sm"
              variant={windowMin === w ? "primary" : "ghost"}
              onClick={() => setWindowMin(w)}
            >
              {w < 60 ? `${w}m` : `${w / 60}h`}
            </Capsule>
          ))}
        </span>
      </header>
      {err ? <div style={{ color: "#d33", fontSize: 12 }}>{err}</div> : null}

      {kpi ? <KpiBar kpi={kpi} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        {csat ? <CsatCard data={csat} /> : null}
        {handoff ? <HandoffCard rows={handoff.by_reason} /> : null}
        {tools ? <ToolsCard rows={tools.rows} /> : null}
        {agents ? <AgentsCard rows={agents.rows} /> : null}
      </div>
    </div>
  );
}

function KpiBar({ kpi }: { kpi: ReportKpi }) {
  const items: Array<{ k: string; v: string }> = [
    { k: "接入次数", v: String(kpi.session_accept) },
    { k: "结束次数", v: String(kpi.session_close) },
    { k: "转人工", v: String(kpi.session_handoff) },
    { k: "转人工率", v: (kpi.handoff_rate * 100).toFixed(1) + "%" },
    { k: "工具调用", v: String(kpi.tool_invocations) },
    { k: "评价数", v: String(kpi.csat_count) },
    { k: "平均评分", v: kpi.csat_avg ? kpi.csat_avg.toFixed(2) : "—" },
  ];
  return (
    <GlassCard radius={12} className="admin-card" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
      {items.map((it) => (
        <div key={it.k} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase" }}>{it.k}</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{it.v}</div>
        </div>
      ))}
    </GlassCard>
  );
}

function CsatCard({ data }: { data: { rating_distribution: Record<string, number>; top_tags: Array<{ key: string; count: number }> } }) {
  const dist = data.rating_distribution;
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>满意度分布</strong>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead>
          <tr><th>星</th><th className="num">数量</th><th>占比</th></tr>
        </thead>
        <tbody>
          {[5, 4, 3, 2, 1].map((r) => {
            const n = dist[String(r)] ?? 0;
            const pct = total === 0 ? 0 : (n / total) * 100;
            return (
              <tr key={r}>
                <td>{"★".repeat(r)}</td>
                <td className="num">{n}</td>
                <td>
                  <div style={{ height: 6, background: "var(--color-surface-alt)", borderRadius: 3 }}>
                    <div style={{ width: pct + "%", height: "100%", background: "#0a7", borderRadius: 3 }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <strong style={{ fontSize: 12, display: "block", marginTop: 8 }}>标签 TopN</strong>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
        {data.top_tags.map((t) => (
          <span key={t.key} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--color-surface-alt)" }}>
            {t.key} <strong>{t.count}</strong>
          </span>
        ))}
      </div>
    </GlassCard>
  );
}

function HandoffCard({ rows }: { rows: Array<{ key: string; count: number }> }) {
  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>转人工原因</strong>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead><tr><th>reason</th><th className="num">次数</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 12 }}>暂无</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key}><td>{r.key}</td><td className="num">{r.count}</td></tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

function ToolsCard({ rows }: { rows: RouteRow[] }) {
  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>工具调用 TopN</strong>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead><tr><th>工具</th><th className="num">次数</th><th className="num">成功率</th><th className="num">平均 ms</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 12 }}>暂无</td></tr>
          ) : rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{r.total}</td>
              <td className="num">{((r.ok_rate ?? 0) * 100).toFixed(0)}%</td>
              <td className="num">{r.avg_ms ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

function AgentsCard({ rows }: { rows: RouteRow[] }) {
  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto", gridColumn: "1 / span 3" }}>
      <strong style={{ fontSize: 13 }}>坐席动作排行</strong>
      <table className="admin-table" style={{ marginTop: 6 }}>
        <thead><tr><th>坐席</th><th className="num">接入</th><th className="num">关闭</th><th className="num">转接</th><th className="num">插话</th><th className="num">总数</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 12 }}>暂无</td></tr>
          ) : rows.map((r) => (
            <tr key={r.agent_id}>
              <td>#{r.agent_id}</td>
              <td className="num">{r.accept ?? 0}</td>
              <td className="num">{r.close ?? 0}</td>
              <td className="num">{r.transfer ?? 0}</td>
              <td className="num">{r.whisper ?? 0}</td>
              <td className="num"><strong>{r.total}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
