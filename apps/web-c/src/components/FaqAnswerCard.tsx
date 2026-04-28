import { Avatar, Capsule, GlassCard } from "@ai-kefu/ui-glass";

import type { FaqAction, FaqMessageContent } from "../mocks/data.js";
import { MiniMarkdown } from "./MiniMarkdown.js";

export interface FaqAnswerCardProps {
  faq: FaqMessageContent;
  /** 用户点 follow_up / send_text → 转发为新一条用户消息 */
  onSend: (text: string) => void;
  /** 用户点 handoff → WS 发起转人工 */
  onHandoff: () => void;
  /** 用户点 open_link → 走 JSBridge / window.open */
  onOpenLink: (url: string) => void;
}

/**
 * FAQ 命中后的卡片气泡 — 由 ai-hub 经 gateway-ws 发出 msg.faq 帧后渲染。
 * 风格:玻璃材质 + AI 头像左侧呼吸光,与 PRD 02 §3.5 / §3.2 保持一致。
 */
export function FaqAnswerCard({ faq, onSend, onHandoff, onOpenLink }: FaqAnswerCardProps) {
  const answer = faq.answer || {};
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <Avatar size={28} fallback="AI" alt="AI 助手" breathing={false} />
      <GlassCard
        strength="weak"
        ring
        radius={18}
        style={{
          maxWidth: "82%",
          padding: 14,
          color: "var(--color-text-primary)",
        }}
      >
        <header
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 6,
          }}
        >
          <span aria-hidden>📘</span>
          <span>常见问题{faq.how === "similar" ? "(相似匹配)" : ""}</span>
          {faq.score && faq.how === "similar" ? (
            <span style={{ marginLeft: "auto" }}>相似度 {(faq.score * 100).toFixed(0)}%</span>
          ) : null}
        </header>

        <div style={{ fontWeight: 600, marginBottom: 6 }}>{faq.title}</div>

        {answer.contentMd ? <MiniMarkdown text={answer.contentMd} /> : null}

        {answer.attachments?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {answer.attachments.map((a, idx) => (
              <a
                key={idx}
                href={a.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-primary)",
                  textDecoration: "none",
                }}
              >
                {a.type === "image" ? "🖼" : a.type === "file" ? "📎" : "🔗"} {prettyUrl(a.url)}
              </a>
            ))}
          </div>
        ) : null}

        {answer.followUps?.length ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <span
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-text-tertiary)",
                marginRight: 4,
              }}
            >
              你可能还想问:
            </span>
            {answer.followUps.map((f) => (
              <Capsule
                key={f.id}
                size="sm"
                variant="ghost"
                onClick={() => onSend(f.title)}
              >
                {f.title}
              </Capsule>
            ))}
          </div>
        ) : null}

        {answer.actions?.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {answer.actions.map((a, idx) => (
              <ActionButton
                key={idx}
                action={a}
                onSend={onSend}
                onHandoff={onHandoff}
                onOpenLink={onOpenLink}
              />
            ))}
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}

function ActionButton(props: {
  action: FaqAction;
  onSend: (t: string) => void;
  onHandoff: () => void;
  onOpenLink: (u: string) => void;
}) {
  const { action, onSend, onHandoff, onOpenLink } = props;
  const variant = action.type === "handoff" ? "primary" : "outline";
  return (
    <Capsule
      size="sm"
      variant={variant}
      onClick={() => {
        if (action.type === "send_text" && action.payload) onSend(action.payload);
        else if (action.type === "handoff") onHandoff();
        else if (action.type === "open_link" && action.payload) onOpenLink(action.payload);
        // open_form 等待 T-401 表单卡片接入
      }}
    >
      {action.label}
    </Capsule>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}
