import { useEffect, useRef, useState } from "react";

import { Avatar, Bubble, Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { closeSession, listMessages, reply, transferToAi } from "../api/client.js";
import type { AiMeta, MessageView, RagChunkRef } from "../api/types.js";

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
    let es: EventSource | null = null;

    const load = async () => {
      try {
        setLoading(true);
        const r = await listMessages(sessionId, 0, 50);
        if (cancelled) return;
        const sorted = [...(r.items ?? [])].sort((a, b) => a.seq - b.seq);
        setMessages(sorted);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const upsert = (incoming: MessageView | null) => {
      if (!incoming) return;
      setMessages((prev) => {
        // 同 id 去重 + 同 (sessionId, clientMsgId) 去重
        const dedup = prev.filter(
          (m) =>
            m.id !== incoming.id &&
            !(
              incoming.clientMsgId &&
              m.clientMsgId &&
              incoming.clientMsgId === m.clientMsgId &&
              incoming.sessionId === m.sessionId
            ),
        );
        return [...dedup, incoming].sort((a, b) => a.seq - b.seq);
      });
    };

    void load();
    // SSE:只在 session-message 携带的 session_id 与当前一致时合并
    try {
      es = new EventSource(`/v1/agent/events?agent_id=${agentId}`);
      es.addEventListener("session-message", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            session_id?: string;
            message?: MessageView;
          };
          if (!data || data.session_id !== sessionId) return;
          upsert(data.message ?? null);
        } catch {
          // 忽略坏 payload
        }
      });
    } catch {
      // 不支持 EventSource 时回退轮询
    }
    // C 端消息已由 gateway-ws → agent-bff 反向通知 → SSE 推送;
    // 这里只保留 60s 极低频兜底,防 SSE 短暂断开期间漏消息(EventSource 自动重连)。
    const fallback = setInterval(load, 60_000);

    return () => {
      cancelled = true;
      clearInterval(fallback);
      es?.close();
    };
  }, [agentId, sessionId]);

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

      <AiSuggestionRow sessionId={sessionId} onPick={send} />

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
            Packet 建议:
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
  const showRag = m.role === "ai" && Array.isArray(m.aiMeta?.rag_chunks) && (m.aiMeta?.rag_chunks?.length ?? 0) > 0;
  const showTools = m.role === "ai" && Array.isArray(m.aiMeta?.tool_calls) && (m.aiMeta?.tool_calls?.length ?? 0) > 0;
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
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "85%" }}>
        <Bubble role={m.role === "agent" ? "user" : m.role}>
          <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
        </Bubble>
        {showRag ? <RagInlineRef meta={m.aiMeta as AiMeta} /> : null}
        {showTools ? <ToolInlineRef meta={m.aiMeta as AiMeta} /> : null}
      </div>
    </div>
  );
}

function RagInlineRef({ meta }: { meta: AiMeta }) {
  const [open, setOpen] = useState(false);
  const chunks = (meta.rag_chunks ?? []) as RagChunkRef[];
  if (!chunks.length) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      style={{
        textAlign: "left",
        padding: "6px 10px",
        background: "var(--color-surface-alt)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        color: "var(--color-text-secondary)",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      <span aria-hidden>📚 </span>
      引用 {chunks.length} 条
      {meta.rag_top_title ? ` · 主要来自《${meta.rag_top_title}》` : ""}
      {typeof meta.rag_score === "number" ? `(score ${meta.rag_score.toFixed(2)})` : ""}
      <span style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>
        {open ? "收起" : "展开"}
      </span>
      {open ? (
        <ol style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
          {chunks.slice(0, 5).map((c, i) => (
            <li key={c.chunk_id ?? i} style={{ marginBottom: 4 }}>
              <strong>{c.title || `chunk ${i + 1}`}</strong>
              {typeof c.score === "number" ? (
                <span style={{ marginLeft: 6, color: "var(--color-text-tertiary)" }}>
                  {c.score.toFixed(2)}
                </span>
              ) : null}
              <div style={{ color: "var(--color-text-tertiary)", fontSize: 11, marginTop: 2 }}>
                {(c.content ?? "").slice(0, 160)}
                {(c.content?.length ?? 0) > 160 ? "…" : ""}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </button>
  );
}

function ToolInlineRef({ meta }: { meta: AiMeta }) {
  const calls = meta.tool_calls ?? [];
  if (!calls.length) return null;
  const okN = calls.filter((c) => c.ok !== false).length;
  const failN = calls.length - okN;
  return (
    <span
      style={{
        alignSelf: "flex-start",
        fontSize: 12,
        color: "var(--color-text-tertiary)",
        padding: "2px 8px",
        border: "1px solid var(--color-border)",
        borderRadius: 999,
        background: "var(--color-surface-alt)",
      }}
      title={calls.map((c) => c.name).join(", ")}
    >
      🔧 工具 {calls.length} 次{failN > 0 ? `(${failN} 失败)` : ""}
    </span>
  );
}

function AiSuggestionRow({
  sessionId,
  onPick,
}: {
  sessionId: string | null;
  onPick: (text: string) => Promise<void> | void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    if (!sessionId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/v1/agent/sessions/${encodeURIComponent(sessionId)}/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { suggestions?: string[]; error?: string };
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      if (data.error) setErr(data.error);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSuggestions([]);
    setErr(null);
  }, [sessionId]);

  if (!sessionId) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "8px 12px",
        overflowX: "auto",
        alignItems: "center",
        borderTop: "1px solid var(--color-border)",
        background:
          "color-mix(in srgb, var(--color-primary) 4%, var(--color-surface-alt))",
      }}
    >
      <span style={{ color: "var(--color-text-secondary)", fontSize: 12, flex: "none" }}>
        ✨ AI 建议:
      </span>
      {suggestions.length === 0 && !loading ? (
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          {err ? `失败:${err}` : "点「生成」让 AI 给候选"}
        </span>
      ) : null}
      {loading ? (
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>生成中…</span>
      ) : null}
      {suggestions.map((s, i) => (
        <Capsule key={i} size="sm" variant="primary" onClick={() => void onPick(s)}>
          {s}
        </Capsule>
      ))}
      <Capsule
        size="sm"
        variant="ghost"
        onClick={() => void refresh()}
        disabled={loading}
      >
        {suggestions.length > 0 ? "重新生成" : "生成"}
      </Capsule>
    </div>
  );
}
