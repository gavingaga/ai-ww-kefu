import { useEffect, useRef } from "react";

import { Avatar, Bubble } from "@ai-kefu/ui-glass";

import type { MediaContent, Message, ToolCallContent } from "../mocks/data.js";
import { CsatBubble } from "./CsatBubble.js";
import { FaqAnswerCard } from "./FaqAnswerCard.js";
import { RagCitation } from "./RagCitation.js";
import { ToolCallBadge } from "./ToolCallBadge.js";

export interface MessageListProps {
  items: Message[];
  onSend: (text: string) => void;
  onHandoff: () => void;
  onOpenLink: (url: string) => void;
  /** dry_run 工具卡片用户点「确认执行」 */
  onToolConfirm?: (tool: ToolCallContent) => void;
  /** dry_run 工具卡片用户点「取消」 */
  onToolCancel?: (tool: ToolCallContent) => void;
  /** 工具失败用户点「重试」 */
  onToolRetry?: (tool: ToolCallContent) => void;
  /** CSAT 提交回调:rating + tags + comment 由 App 组装 ws.send event.csat */
  onCsatSubmit?: (
    msgId: string,
    input: { rating: number; tags: string[]; comment?: string },
  ) => void;
}

export function MessageList({
  items,
  onSend,
  onHandoff,
  onOpenLink,
  onToolConfirm,
  onToolCancel,
  onToolRetry,
  onCsatSubmit,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length]);

  return (
    <div
      role="log"
      aria-live="polite"
      style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 12px 4px",
      }}
    >
      {items.map((m) => (
        <Row
          key={m.id}
          m={m}
          onSend={onSend}
          onHandoff={onHandoff}
          onOpenLink={onOpenLink}
          onToolConfirm={onToolConfirm}
          onToolCancel={onToolCancel}
          onToolRetry={onToolRetry}
          onCsatSubmit={onCsatSubmit}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function Row({
  m,
  onSend,
  onHandoff,
  onOpenLink,
  onToolConfirm,
  onToolCancel,
  onToolRetry,
  onCsatSubmit,
}: {
  m: Message;
  onSend: (t: string) => void;
  onHandoff: () => void;
  onOpenLink: (u: string) => void;
  onToolConfirm?: (tool: ToolCallContent) => void;
  onToolCancel?: (tool: ToolCallContent) => void;
  onToolRetry?: (tool: ToolCallContent) => void;
  onCsatSubmit?: (msgId: string, input: { rating: number; tags: string[]; comment?: string }) => void;
}) {
  if (m.kind === "faq") {
    return (
      <FaqAnswerCard
        faq={m.faq}
        onSend={onSend}
        onHandoff={onHandoff}
        onOpenLink={onOpenLink}
      />
    );
  }
  if (m.kind === "tool") {
    return (
      <ToolCallBadge
        tool={m.tool}
        onConfirm={onToolConfirm}
        onCancel={onToolCancel}
        onRetry={onToolRetry}
      />
    );
  }
  if (m.kind === "rag") {
    return <RagCitation rag={m.rag} />;
  }
  if (m.kind === "image" || m.kind === "file") {
    return <MediaBubble m={m} />;
  }
  if (m.kind === "csat") {
    return (
      <CsatBubble
        csat={m.csat}
        onSubmit={(input) => onCsatSubmit?.(m.id, input)}
      />
    );
  }
  if (m.role === "system") {
    return <Bubble role="system">{m.text}</Bubble>;
  }
  const isUser = m.role === "user";
  const breathing = m.role === "ai" && m.thinking;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        flexDirection: isUser ? "row-reverse" : "row",
      }}
    >
      {!isUser && (
        <Avatar
          size={28}
          breathing={breathing}
          fallback={m.role === "ai" ? "AI" : "客"}
          alt={m.role === "ai" ? "AI 助手" : "人工客服"}
        />
      )}
      <Bubble role={m.role} thinking={m.thinking}>
        <span style={{ whiteSpace: "pre-wrap" }}>{m.text}</span>
      </Bubble>
    </div>
  );
}

function MediaBubble({ m }: { m: Extract<Message, { kind: "image" | "file" }> }) {
  const isUser = m.role === "user";
  const isImage = m.kind === "image";
  const media: MediaContent = m.media;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        flexDirection: isUser ? "row-reverse" : "row",
      }}
    >
      {!isUser && <Avatar size={28} fallback={m.role === "ai" ? "AI" : "客"} alt={m.role} />}
      <div
        style={{
          maxWidth: "72%",
          padding: 8,
          background: isUser
            ? "linear-gradient(135deg, var(--bubble-user-from), var(--bubble-user-to))"
            : "var(--bubble-system)",
          color: isUser ? "#fff" : "var(--color-text-primary)",
          borderRadius: "var(--radius-bubble)",
          border: "1px solid var(--color-border)",
        }}
      >
        {isImage ? (
          <img
            src={media.url}
            alt={media.filename ?? "image"}
            style={{
              maxWidth: 240,
              maxHeight: 240,
              borderRadius: 8,
              display: "block",
              opacity: media.progress != null && media.progress < 100 ? 0.5 : 1,
            }}
          />
        ) : (
          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            📄 {media.filename ?? "文件"}
          </a>
        )}
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
          {media.size ? formatSize(media.size) : null}
          {media.progress != null && media.progress < 100 ? (
            <> · 上传中 {media.progress}%</>
          ) : null}
          {media.error ? <span style={{ color: "#ffb"}}> · 失败:{media.error}</span> : null}
        </div>
      </div>
    </div>
  );
}

function formatSize(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}
