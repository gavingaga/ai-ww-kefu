import { useEffect, useRef } from "react";

import { Avatar, Bubble } from "@ai-kefu/ui-glass";

import type { Message } from "../mocks/data.js";

export interface MessageListProps {
  items: Message[];
}

export function MessageList({ items }: MessageListProps) {
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
        <Row key={m.id} m={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function Row({ m }: { m: Message }) {
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
