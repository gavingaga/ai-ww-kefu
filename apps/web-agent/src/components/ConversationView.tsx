import { useEffect, useRef, useState } from "react";

import { Avatar, Bubble, Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { closeSession, listMessages, reply, transferToAi } from "../api/client.js";
import type { MessageView } from "../api/types.js";

export interface ConversationViewProps {
  agentId: number;
  sessionId: string | null;
  /** 操作完成后由父级刷新 inbox */
  onAfterAction: () => void;
  /** 候选回复(从 packet.suggested_replies 拿) */
  suggestedReplies?: string[];
}

export function ConversationView({
  agentId,
  sessionId,
  onAfterAction,
  suggestedReplies,
}: ConversationViewProps) {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const r = await listMessages(sessionId, 0, 50);
        if (!cancelled)
          setMessages([...(r.items ?? [])].sort((a, b) => a.seq - b.seq));
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (!sessionId) {
    return (
      <GlassCard
        strength="base"
        radius={16}
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-tertiary)",
        }}
      >
        从左侧选择或接入一个会话开始工作
      </GlassCard>
    );
  }

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    try {
      const m = await reply(agentId, sessionId, t);
      setMessages((prev) => [...prev, m]);
      setDraft("");
    } catch (err) {
      console.error("[reply]", err);
    }
  };

  return (
    <GlassCard
      strength="base"
      radius={16}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <strong style={{ fontSize: "var(--font-size-caption)" }}>{sessionId}</strong>
        {loading ? (
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
            加载中…
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <Capsule
            size="sm"
            variant="ghost"
            onClick={async () => {
              await transferToAi(agentId, sessionId);
              onAfterAction();
            }}
          >
            转回 AI
          </Capsule>
          <Capsule
            size="sm"
            variant="outline"
            onClick={async () => {
              await closeSession(agentId, sessionId);
              onAfterAction();
            }}
          >
            结束会话
          </Capsule>
        </span>
      </header>

      <div
        role="log"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((m) => (
          <Row key={m.id} m={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {suggestedReplies && suggestedReplies.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 12px",
            overflowX: "auto",
            whiteSpace: "nowrap",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <span
            style={{
              color: "var(--color-text-tertiary)",
              fontSize: 12,
              alignSelf: "center",
              flex: "none",
            }}
          >
            建议回复:
          </span>
          {suggestedReplies.map((s, i) => (
            <Capsule key={i} size="sm" variant="ghost" onClick={() => send(s)}>
              {s}
            </Capsule>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 12px 12px",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
          placeholder="输入回复;Enter 发送 / Shift+Enter 换行"
          rows={2}
          style={{
            flex: 1,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-bubble)",
            padding: "8px 12px",
            background: "var(--color-surface-alt)",
            outline: "none",
            font: "inherit",
            fontSize: "var(--font-size-body)",
            color: "var(--color-text-primary)",
            resize: "none",
            lineHeight: 1.5,
          }}
        />
        <Capsule size="md" variant="primary" onClick={() => send(draft)} disabled={!draft.trim()}>
          发送
        </Capsule>
      </div>
    </GlassCard>
  );
}

function Row({ m }: { m: MessageView }) {
  const text = String(m.content?.text ?? "");
  if (m.role === "system") {
    return <Bubble role="system">{text}</Bubble>;
  }
  const isAgent = m.role === "agent";
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        flexDirection: isAgent ? "row-reverse" : "row",
      }}
    >
      {!isAgent && (
        <Avatar
          size={26}
          fallback={m.role === "ai" ? "AI" : "用户"}
          alt={m.role === "ai" ? "AI" : "用户"}
        />
      )}
      <Bubble role={m.role === "agent" ? "user" : m.role}>
        <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
      </Bubble>
    </div>
  );
}
