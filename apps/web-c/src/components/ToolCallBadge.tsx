import { useState } from "react";

import { Avatar, Capsule } from "@ai-kefu/ui-glass";

import type { ToolCallContent } from "../mocks/data.js";

const FRIENDLY_NAMES: Record<string, string> = {
  get_play_diagnostics: "正在查询播放诊断",
  get_room_info: "正在查询直播间信息",
  get_vod_info: "正在查询节目信息",
  get_membership: "正在核对会员状态",
  get_subscription_orders: "正在核对订阅记录",
  cancel_subscription: "正在准备取消订阅(待您确认)",
  get_anchor_info: "正在查询主播信息",
  report_content: "正在登记举报",
  switch_quality_hint: "正在为您建议清晰度",
};

/** 工具失败常见原因 → 用户语 */
const ERROR_CATEGORIES: Array<{ match: RegExp; hint: string }> = [
  { match: /timeout|timed.?out|deadline/i, hint: "查询超时,稍后重试" },
  { match: /rate.?limit/i, hint: "请求过于频繁,请稍后再试" },
  { match: /not.?registered|unknown.?tool/i, hint: "该功能暂不可用,可改用人工" },
  { match: /bad.?args|invalid.?args/i, hint: "参数有误,请重新描述问题" },
  { match: /live.?execution.?disabled/i, hint: "该写操作暂未上线,请稍候或联系客服" },
  { match: /unauthorized|forbidden/i, hint: "权限不足,请登录或转人工" },
  { match: /network|connection/i, hint: "网络异常,请稍后重试" },
];

/**
 * 工具调用提示气泡 — AI 正在/已经调用某个业务工具的可视化反馈。
 *
 * 设计:
 *  - 默认折叠显示一行小胶囊(状态点 + 工具名 + 完成 / 失败 / 待确认)
 *  - 写操作 dry_run:展示「确认执行 / 取消」CTA(由 onConfirm/onCancel 回调到 App)
 *  - 失败:展示分类化的人类语错误 + 「重试」CTA
 *  - 详情点开看 result/error JSON
 */
export function ToolCallBadge({
  tool,
  onConfirm,
  onCancel,
  onRetry,
}: {
  tool: ToolCallContent;
  /** 写操作 dry_run 时,用户点「确认执行」 — 由父级转成"确认执行 X(args)"用户消息 */
  onConfirm?: (tool: ToolCallContent) => void;
  /** 写操作 dry_run 时,用户点「取消」 — 通常发"取消该操作"消息 */
  onCancel?: (tool: ToolCallContent) => void;
  /** 失败时点击「重试」 — 父级重发原始 query 让 LLM 再走一次 */
  onRetry?: (tool: ToolCallContent) => void;
}) {
  const [open, setOpen] = useState(false);
  const friendly = FRIENDLY_NAMES[tool.name] ?? tool.name;
  const result = tool.result as Record<string, unknown> | undefined;
  const isPendingConfirm = !!(tool.ok && result?.dry_run === true);
  const dotColor = !tool.ok
    ? "var(--color-danger)"
    : isPendingConfirm
      ? "var(--color-warning, #e80)"
      : "var(--color-success)";
  const stateLabel = !tool.ok ? "失败" : isPendingConfirm ? "待确认" : "完成";
  const summary = friendlySummary(tool);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <Avatar size={24} fallback="🔧" alt="工具" />
      <div
        style={{
          maxWidth: "82%",
          padding: "8px 12px",
          background: "var(--bubble-system)",
          backdropFilter: "blur(var(--blur-glass-weak))",
          WebkitBackdropFilter: "blur(var(--blur-glass-weak))",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-bubble)",
          color: "var(--color-text-primary)",
          fontSize: "var(--font-size-caption)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            color: "inherit",
            font: "inherit",
            textAlign: "left",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "var(--color-text-secondary)",
              width: "100%",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: dotColor,
                boxShadow: tool.ok
                  ? `0 0 6px color-mix(in srgb, ${dotColor} 70%, transparent)`
                  : undefined,
              }}
            />
            <span>{friendly}</span>
            <span style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }}>
              {stateLabel} · <span aria-hidden>{open ? "收起" : "展开"}</span>
            </span>
          </span>
          {summary ? (
            <div style={{ color: "var(--color-text-primary)", marginTop: 4 }}>{summary}</div>
          ) : null}
        </button>

        {isPendingConfirm && (onConfirm || onCancel) ? (
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            {onConfirm ? (
              <Capsule size="sm" variant="primary" onClick={() => onConfirm(tool)}>
                确认执行
              </Capsule>
            ) : null}
            {onCancel ? (
              <Capsule size="sm" variant="ghost" onClick={() => onCancel(tool)}>
                取消
              </Capsule>
            ) : null}
          </div>
        ) : null}
        {!tool.ok && onRetry ? (
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <Capsule size="sm" variant="ghost" onClick={() => onRetry(tool)}>
              重试
            </Capsule>
          </div>
        ) : null}
        {open ? <ToolDetail tool={tool} /> : null}
      </div>
    </div>
  );
}

function friendlySummary(tool: ToolCallContent): string {
  if (!tool.ok) {
    const raw = tool.error ?? "";
    for (const c of ERROR_CATEGORIES) {
      if (c.match.test(raw)) return c.hint;
    }
    return raw ? `执行失败:${raw}` : "执行失败";
  }
  const r = tool.result as Record<string, unknown> | undefined;
  if (!r) return "";
  if (tool.name === "get_play_diagnostics") {
    const verdict = String(r.verdict ?? "");
    const map: Record<string, string> = {
      local_network: "本地网络偏弱",
      cdn: "CDN/源站故障",
      origin: "源站故障",
      auth: "鉴权异常",
      app_bug: "客户端异常",
      unknown: "未发现明显问题",
    };
    return r.summary ? String(r.summary) : map[verdict] ?? "";
  }
  if (tool.name === "get_membership") {
    return `等级 ${String(r.level ?? "?")}, 自动续费 ${r.auto_renew ? "开启" : "关闭"}`;
  }
  if (tool.name === "cancel_subscription") {
    return r.dry_run ? "已模拟取消,等待你确认" : "已取消";
  }
  return "";
}

function ToolDetail({ tool }: { tool: ToolCallContent }) {
  const body = tool.ok ? tool.result : { error: tool.error };
  return (
    <pre
      style={{
        margin: 0,
        marginTop: 4,
        padding: 8,
        background: "var(--color-surface-alt)",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        color: "var(--color-text-secondary)",
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {JSON.stringify(body, null, 2)}
    </pre>
  );
}
