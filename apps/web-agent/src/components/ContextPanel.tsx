import { useEffect, useMemo, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { getApproval, submitApproval } from "../api/client.js";
import { invokeTool, type ToolInvokeResponse } from "../api/tool.js";
import type { AgentInfo, HandoffPacket } from "../api/types.js";
import { SupervisorActions } from "./SupervisorActions.js";

export interface ContextPanelProps {
  packet: HandoffPacket | null;
  liveContext: Record<string, unknown> | null;
  agent: AgentInfo | null;
  fromAgentId: number;
  sessionId: string | null;
  onAfterAction: () => void;
}

type TabKey =
  | "overview"
  | "user"
  | "subscription"
  | "scene"
  | "diagnostic"
  | "history"
  | "compliance"
  | "notes";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "概览" },
  { key: "user", label: "用户" },
  { key: "subscription", label: "订阅" },
  { key: "scene", label: "直播间" },
  { key: "diagnostic", label: "诊断" },
  { key: "history", label: "历史" },
  { key: "compliance", label: "合规" },
  { key: "notes", label: "备注" },
];

/** 右栏 8 Tab — 用户画像 / 订阅 / 直播间 / 诊断 / 历史 / 合规 / 备注 + 协作。 */
export function ContextPanel({
  packet,
  liveContext,
  agent,
  fromAgentId,
  sessionId,
  onAfterAction,
}: ContextPanelProps) {
  const [tab, setTab] = useState<TabKey>("overview");
  const lc = liveContext ?? {};
  const uid =
    readNum((packet?.user as Record<string, unknown> | undefined)?.uid) ??
    readNum((lc.user as Record<string, unknown> | undefined)?.uid);
  const roomId = readNum(lc.room_id);
  const vodId = readNum(lc.vod_id);
  const ctx = sessionId ? { session_id: sessionId, live_context: lc } : undefined;

  return (
    <GlassCard
      strength="base"
      radius={16}
      style={{
        height: "100%",
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 8px 0",
          borderBottom: "1px solid var(--color-border)",
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "6px 10px",
              border: "none",
              borderRadius: "8px 8px 0 0",
              background: tab === t.key ? "var(--color-surface-alt)" : "transparent",
              color: tab === t.key ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: tab === t.key ? 600 : 400,
              flex: "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {tab === "overview" ? <Overview packet={packet} liveContext={lc} /> : null}
        {tab === "user" ? <UserTab packet={packet} liveContext={lc} /> : null}
        {tab === "subscription" ? (
          <SubscriptionTab uid={uid} ctx={ctx} agentId={fromAgentId} sessionId={sessionId} />
        ) : null}
        {tab === "scene" ? <SceneTab roomId={roomId} vodId={vodId} ctx={ctx} /> : null}
        {tab === "diagnostic" ? (
          <DiagnosticTab roomId={roomId} vodId={vodId} ctx={ctx} />
        ) : null}
        {tab === "history" ? <HistoryTab packet={packet} /> : null}
        {tab === "compliance" ? <ComplianceTab packet={packet} liveContext={lc} /> : null}
        {tab === "notes" ? <NotesTab sessionId={sessionId} /> : null}

        {sessionId ? (
          <Section title="协作">
            <SupervisorActions
              agent={agent}
              fromAgentId={fromAgentId}
              sessionId={sessionId}
              onAfterAction={onAfterAction}
            />
          </Section>
        ) : null}
      </div>
    </GlassCard>
  );
}

// ───── Tabs ─────

function Overview({
  packet,
  liveContext,
}: {
  packet: HandoffPacket | null;
  liveContext: Record<string, unknown>;
}) {
  if (!packet && Object.keys(liveContext).length === 0) {
    return <Empty text="尚未接入会话" />;
  }
  return (
    <>
      {packet ? (
        <Section title="转人工接力包">
          <Row label="原因" value={packet.reason} />
          <Row label="技能组" value={packet.skill_group_hint ?? "-"} />
          {packet.summary ? (
            <p style={{ margin: "6px 0", color: "var(--color-text-primary)", fontSize: 13 }}>
              {packet.summary}
            </p>
          ) : null}
        </Section>
      ) : null}
      {Object.keys(liveContext).length > 0 ? (
        <Section title="直播 / 点播 上下文">
          <KV obj={liveContext} />
        </Section>
      ) : null}
    </>
  );
}

function UserTab({
  packet,
  liveContext,
}: {
  packet: HandoffPacket | null;
  liveContext: Record<string, unknown>;
}) {
  const u =
    (packet?.user as Record<string, unknown> | undefined) ??
    (liveContext.user as Record<string, unknown> | undefined);
  if (!u) return <Empty text="无用户画像信息" />;
  return <KV obj={u} title="用户画像" />;
}

function SubscriptionTab({
  uid,
  ctx,
  agentId,
  sessionId,
}: {
  uid: number | null;
  ctx: Record<string, unknown> | undefined;
  agentId: number;
  sessionId: string | null;
}) {
  return (
    <>
      <ToolView
        title="订阅 / 会员"
        disabled={uid == null}
        disabledHint="缺少 uid,无法查询"
        runs={[
          { name: "get_membership", args: { uid }, label: "会员状态" },
          { name: "get_subscription_orders", args: { uid, limit: 5 }, label: "最近订单" },
        ]}
        ctx={ctx}
      />
      {uid != null && sessionId ? (
        <HighRiskApproval
          agentId={agentId}
          sessionId={sessionId}
          tool="cancel_subscription"
          presetArgs={{ uid }}
        />
      ) : null}
    </>
  );
}

/** 高风险写工具申请审批 — pending 阶段 2s 轮询状态。 */
function HighRiskApproval({
  agentId,
  sessionId,
  tool,
  presetArgs,
}: {
  agentId: number;
  sessionId: string;
  tool: string;
  presetArgs: Record<string, unknown>;
}) {
  const [reason, setReason] = useState("");
  const [argsRaw, setArgsRaw] = useState(JSON.stringify(presetArgs));
  const [status, setStatus] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!approvalId) return;
    if (status && status !== "pending") return;
    const t = setInterval(async () => {
      try {
        const a = await getApproval(agentId, approvalId);
        setStatus(a.status);
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [approvalId, agentId, status]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const args = argsRaw ? (JSON.parse(argsRaw) as Record<string, unknown>) : {};
      const a = await submitApproval(agentId, { session_id: sessionId, tool, args, reason });
      setApprovalId(a.id);
      setStatus(a.status);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={`高风险动作 — ${tool}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        <label>
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>args (JSON)</span>
          <textarea
            value={argsRaw}
            onChange={(e) => setArgsRaw(e.target.value)}
            rows={2}
            disabled={!!approvalId}
            style={{
              width: "100%",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "4px 6px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              background: "var(--color-surface-alt)",
              color: "var(--color-text-primary)",
              resize: "vertical",
            }}
          />
        </label>
        <label>
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>申请理由</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={!!approvalId}
            placeholder="如:用户已确认订单 ord_xxx,符合 30 天无理由"
            style={{
              width: "100%",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "4px 6px",
              fontSize: 12,
              background: "var(--color-surface-alt)",
              color: "var(--color-text-primary)",
            }}
          />
        </label>
        {!approvalId ? (
          <Capsule size="sm" variant="primary" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? "提交中…" : "申请审批"}
          </Capsule>
        ) : (
          <ApprovalStatusBadge status={status ?? "pending"} />
        )}
        {err ? <span style={{ color: "var(--color-danger)", fontSize: 11 }}>{err}</span> : null}
      </div>
    </Section>
  );
}

function ApprovalStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; text: string }> = {
    pending: { color: "var(--color-warning)", text: "⏳ 等待主管审批中…" },
    approved: { color: "var(--color-success)", text: "✓ 已通过,可执行" },
    rejected: { color: "var(--color-danger)", text: "✗ 已驳回" },
  };
  const m = map[status] ?? { color: "var(--color-text-tertiary)", text: status };
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        background: `color-mix(in srgb, ${m.color} 20%, var(--color-surface))`,
        color: m.color,
        fontSize: 12,
        fontWeight: 500,
        alignSelf: "flex-start",
      }}
    >
      {m.text}
    </span>
  );
}

function SceneTab({
  roomId,
  vodId,
  ctx,
}: {
  roomId: number | null;
  vodId: number | null;
  ctx: Record<string, unknown> | undefined;
}) {
  const runs: ToolRun[] = [];
  if (roomId != null) runs.push({ name: "get_room_info", args: { room_id: roomId }, label: "直播间信息" });
  if (vodId != null) runs.push({ name: "get_vod_info", args: { vod_id: vodId }, label: "节目信息" });
  if (runs.length === 0) {
    return <Empty text="缺少 room_id / vod_id" />;
  }
  return <ToolView title="场景信息" runs={runs} ctx={ctx} />;
}

function DiagnosticTab({
  roomId,
  vodId,
  ctx,
}: {
  roomId: number | null;
  vodId: number | null;
  ctx: Record<string, unknown> | undefined;
}) {
  if (roomId == null && vodId == null) {
    return <Empty text="缺少 room_id / vod_id,无法诊断" />;
  }
  return (
    <ToolView
      title="播放诊断"
      runs={[
        {
          name: "get_play_diagnostics",
          args: roomId != null ? { room_id: roomId } : { vod_id: vodId },
          label: "QoE 诊断",
        },
      ]}
      ctx={ctx}
    />
  );
}

function HistoryTab({ packet }: { packet: HandoffPacket | null }) {
  if (!packet?.history || packet.history.length === 0) return <Empty text="无历史对话" />;
  return (
    <Section title={`最近对话(${packet.history.length})`}>
      <ol
        style={{
          padding: "6px 14px",
          margin: 0,
          fontSize: 12,
          color: "var(--color-text-secondary)",
          lineHeight: 1.6,
        }}
      >
        {packet.history.map((h, i) => (
          <li key={i}>
            <strong>{h.role}</strong>: {h.content}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function ComplianceTab({
  packet,
  liveContext,
}: {
  packet: HandoffPacket | null;
  liveContext: Record<string, unknown>;
}) {
  const reason = packet?.reason;
  const ent = packet?.entities as Record<string, unknown> | undefined;
  const report = liveContext.report as Record<string, unknown> | undefined;
  const minor = (liveContext.user as Record<string, unknown> | undefined)?.is_minor_guard;
  const flags: Array<{ k: string; v: string; tone: "alert" | "warn" | "ok" }> = [];
  if (reason === "minor_compliance") flags.push({ k: "未成年合规", v: "命中", tone: "alert" });
  if (reason === "report_compliance") flags.push({ k: "举报合规", v: "命中", tone: "alert" });
  if (minor === true) flags.push({ k: "is_minor_guard", v: "true", tone: "alert" });
  if (report) flags.push({ k: "举报类型", v: String(report.type ?? "-"), tone: "warn" });
  if (flags.length === 0) flags.push({ k: "状态", v: "未发现合规风险", tone: "ok" });
  return (
    <Section title="合规标记">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {flags.map((f, i) => (
          <div
            key={i}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              background:
                f.tone === "alert"
                  ? "color-mix(in srgb, var(--color-danger) 14%, var(--color-surface))"
                  : f.tone === "warn"
                    ? "color-mix(in srgb, var(--color-warning) 14%, var(--color-surface))"
                    : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              fontSize: 12,
            }}
          >
            <strong>{f.k}</strong>:{f.v}
          </div>
        ))}
      </div>
      {ent ? <KV obj={ent} title="实体" /> : null}
    </Section>
  );
}

function NotesTab({ sessionId }: { sessionId: string | null }) {
  const key = sessionId ? `aikefu.agent.notes.${sessionId}` : null;
  const [text, setText] = useState("");
  useEffect(() => {
    if (!key) {
      setText("");
      return;
    }
    setText(localStorage.getItem(key) ?? "");
  }, [key]);
  if (!key) return <Empty text="先选择一个会话" />;
  return (
    <Section title="坐席备注(本地)">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          localStorage.setItem(key, e.target.value);
        }}
        rows={6}
        placeholder="例:用户已确认订单号 ord_1234,等售后回复;有 VIP 倾向,可推年卡。"
        style={{
          width: "100%",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: "8px 10px",
          background: "var(--color-surface-alt)",
          font: "inherit",
          fontSize: 13,
          color: "var(--color-text-primary)",
          outline: "none",
          resize: "vertical",
        }}
      />
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
        自动保存到浏览器 localStorage,关闭会话不会清空。
      </div>
    </Section>
  );
}

// ───── 复用工具:批量调 tool-svc ─────

interface ToolRun {
  name: string;
  args: Record<string, unknown>;
  label: string;
}

function ToolView({
  title,
  runs,
  ctx,
  disabled,
  disabledHint,
}: {
  title: string;
  runs: ToolRun[];
  ctx: Record<string, unknown> | undefined;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [results, setResults] = useState<Record<string, ToolInvokeResponse | "loading" | undefined>>({});
  const cacheKey = useMemo(() => JSON.stringify(runs), [runs]);

  const run = async () => {
    if (disabled) return;
    for (const r of runs) {
      setResults((prev) => ({ ...prev, [r.name]: "loading" }));
      try {
        const resp = await invokeTool(r.name, r.args, ctx as ConstructorParameters<typeof invokeTool>[2] | undefined);
        setResults((prev) => ({ ...prev, [r.name]: resp }));
      } catch (e) {
        setResults((prev) => ({
          ...prev,
          [r.name]: { ok: false, error: String((e as Error).message) },
        }));
      }
    }
  };

  useEffect(() => {
    if (!disabled) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, disabled]);

  if (disabled) return <Empty text={disabledHint ?? "依赖参数不完整"} />;

  return (
    <Section
      title={title}
      action={
        <Capsule size="sm" variant="ghost" onClick={() => void run()}>
          刷新
        </Capsule>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {runs.map((r) => {
          const v = results[r.name];
          return (
            <div
              key={r.name}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "8px 10px",
                background: "var(--color-surface-alt)",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 4 }}>
                {r.label} · <code style={{ fontSize: 11 }}>{r.name}</code>
              </div>
              {v === "loading" || v === undefined ? (
                <div style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>加载中…</div>
              ) : v.ok ? (
                <KV obj={(v.result ?? {}) as Record<string, unknown>} />
              ) : (
                <div style={{ color: "var(--color-danger, #d33)", fontSize: 12 }}>
                  {v.error ?? "执行失败"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ───── primitives ─────

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: "var(--font-size-caption)",
          color: "var(--color-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 6,
        }}
      >
        {title}
        {action ? <span style={{ marginLeft: "auto" }}>{action}</span> : null}
      </header>
      <div>{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        color: "var(--color-text-tertiary)",
        fontSize: "var(--font-size-caption)",
        padding: "8px 0",
      }}
    >
      {text}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: "var(--font-size-caption)" }}>
      <span style={{ color: "var(--color-text-tertiary)", minWidth: 60 }}>{label}</span>
      <span>{value ?? "-"}</span>
    </div>
  );
}

function KV({ obj, title }: { obj: Record<string, unknown>; title?: string }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <Empty text={title ? `${title} 为空` : "(空)"} />;
  }
  return (
    <div>
      {title ? <strong style={{ fontSize: "var(--font-size-caption)" }}>{title}</strong> : null}
      <table style={{ width: "100%", fontSize: 12, marginTop: title ? 4 : 0 }}>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td
                style={{
                  color: "var(--color-text-tertiary)",
                  padding: "2px 6px 2px 0",
                  verticalAlign: "top",
                }}
              >
                {k}
              </td>
              <td style={{ padding: "2px 0", wordBreak: "break-all" }}>{stringify(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function readNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
