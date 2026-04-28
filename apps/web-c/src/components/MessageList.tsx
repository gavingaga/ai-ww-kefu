import { useEffect, useRef } from "react";

import { Avatar, Bubble } from "@ai-kefu/ui-glass";

import type { Message } from "../mocks/data.js";
import { FaqAnswerCard } from "./FaqAnswerCard.js";
import { RagCitation } from "./RagCitation.js";
import { ToolCallBadge } from "./ToolCallBadge.js";

export interface MessageListProps {
  items: Message[];
  onSend: (text: string) => void;
  onHandoff: () => void;
  onOpenLink: (url: string) => void;
}

export function MessageList({ items, onSend, onHandoff, onOpenLink }: MessageListProps) {
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
}: {
  m: Message;
  onSend: (t: string) => void;
  onHandoff: () => void;
  onOpenLink: (u: string) => void;
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
    return <ToolCallBadge tool={m.tool} />;
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
