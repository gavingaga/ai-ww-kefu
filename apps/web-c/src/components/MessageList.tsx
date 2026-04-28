import { useEffect, useRef } from "react";

import { Avatar, Bubble } from "@ai-kefu/ui-glass";

import type { Message, ToolCallContent } from "../mocks/data.js";
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
}

export function MessageList({
  items,
  onSend,
  onHandoff,
  onOpenLink,
  onToolConfirm,
  onToolCancel,
  onToolRetry,
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
}: {
  m: Message;
  onSend: (t: string) => void;
  onHandoff: () => void;
  onOpenLink: (u: string) => void;
  onToolConfirm?: (tool: ToolCallContent) => void;
  onToolCancel?: (tool: ToolCallContent) => void;
  onToolRetry?: (tool: ToolCallContent) => void;
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
