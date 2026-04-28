import { useState } from "react";

import { Avatar } from "@ai-kefu/ui-glass";

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

/**
 * 工具调用提示气泡 — AI 正在/已经调用某个业务工具的可视化反馈。
 *
 * 设计:
 *  - 默认折叠显示一行小胶囊(状态点 + 工具名)
 *  - 点击展开 result/error JSON 摘要(<pre>)
 *  - 与普通气泡区分:更小、配色偏中性灰玻璃
 */
export function ToolCallBadge({ tool }: { tool: ToolCallContent }) {
  const [open, setOpen] = useState(false);
  const friendly = FRIENDLY_NAMES[tool.name] ?? tool.name;
  const dotColor = tool.ok ? "var(--color-success)" : "var(--color-danger)";
  const summary = friendlySummary(tool);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <Avatar size={24} fallback="🔧" alt="工具" />
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          maxWidth: "82%",
          textAlign: "left",
          padding: "8px 12px",
          background: "var(--bubble-system)",
          backdropFilter: "blur(var(--blur-glass-weak))",
          WebkitBackdropFilter: "blur(var(--blur-glass-weak))",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-bubble)",
          color: "var(--color-text-primary)",
          fontSize: "var(--font-size-caption)",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
        aria-expanded={open}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "var(--color-text-secondary)",
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
            {tool.ok ? "完成" : "失败"} ·{" "}
            <span aria-hidden>{open ? "收起" : "展开"}</span>
          </span>
        </span>
        {summary ? (
          <span style={{ color: "var(--color-text-primary)" }}>{summary}</span>
        ) : null}
        {open ? <ToolDetail tool={tool} /> : null}
      </button>
    </div>
  );
}

function friendlySummary(tool: ToolCallContent): string {
  if (!tool.ok) return tool.error ? `错误:${tool.error}` : "执行失败";
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
