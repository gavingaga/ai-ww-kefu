import { Avatar, Bubble, Capsule, GlassCard } from "@ai-kefu/ui-glass";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

import { closeSession, listMessages, reply, replyMedia, transferToAi } from "../api/client.js";
import type { AiMeta, MessageView, RagChunkRef } from "../api/types.js";
import { preflight, uploadFile } from "../upload/uploadFile.js";

export interface ConversationViewProps {
  agentId: number;
  sessionId: string | null;
  /** 操作完成后由父级刷新 inbox */
  onAfterAction: () => void;
  /** 候选回复(从 packet.suggested_replies 拿) */
  suggestedReplies?: string[];
  /** 只读模式(AI 托管会话查看):隐藏发送栏 / 关闭 / 转回 AI 等行动按钮 */
  readOnly?: boolean;
  /** 只读模式下额外操作(如「接管」按钮)— 坐席从 AI 抢过来 */
  extraActions?: React.ReactNode;
}

export function ConversationView({
  agentId,
  sessionId,
  onAfterAction,
  suggestedReplies,
  readOnly,
  extraActions,
}: ConversationViewProps) {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // upsert 在 send 路径与 SSE 推送路径共用 — 统一去重避免坐席自己发的消息显示两条
  // (一次本地 setMessages、一次 SSE session-message 回推)。
  const upsert = useCallback((incoming: MessageView | null) => {
    if (!incoming) return;
    setMessages((prev) => {
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
  }, []);

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
  }, [agentId, sessionId, upsert]);

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

  const sendMedia = async (file: File) => {
    if (!sessionId) return;
    const err = preflight(file);
    if (err) {
      setSendErr("上传失败:" + err);
      return;
    }
    setSendErr(null);
    setUploading(true);

    // optimistic UI:上传开始立刻插占位气泡(blob: 预览 + progress=0)
    // upsert 按 (clientMsgId, sessionId) 去重,replyMedia 成功后会用真实 m 覆盖。
    const isImage = file.type.startsWith("image/");
    const cmid = `agent-${isImage ? "img" : "file"}-${Date.now()}`;
    const previewUrl = URL.createObjectURL(file);
    const placeholderId = `local-${cmid}`;
    const placeholder: MessageView = {
      id: placeholderId,
      sessionId,
      seq: Number.MAX_SAFE_INTEGER, // 暂排在最末,真实 m 回来按 seq 重排
      clientMsgId: cmid,
      role: "agent",
      type: isImage ? "image" : "file",
      content: {
        url: previewUrl,
        filename: file.name,
        size: file.size,
        content_type: file.type,
        progress: 0,
        uploading: true,
      },
      status: "sending",
      createdAt: new Date().toISOString(),
    };
    upsert(placeholder);

    const updateProgress = (p: number) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                content: { ...(m.content ?? {}), progress: p },
              }
            : m,
        ),
      );
    };

    try {
      const r = await uploadFile(file, updateProgress);
      const m = await replyMedia(
        agentId,
        sessionId,
        isImage ? "image" : "file",
        {
          url: r.url,
          filename: file.name,
          size: r.size ?? file.size,
          contentType: r.contentType ?? file.type,
        },
        cmid,
      );
      // 移除占位 + 释放 blob,upsert 真实 m(同 cmid 会去重旧条目)
      URL.revokeObjectURL(previewUrl);
      setMessages((prev) => prev.filter((x) => x.id !== placeholderId));
      upsert(m);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      console.error("[upload/replyMedia]", e);
      // 占位标 error,让坐席看到失败原因
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                content: {
                  ...(m.content ?? {}),
                  error: msg,
                  uploading: false,
                  progress: undefined,
                },
                status: "failed",
              }
            : m,
        ),
      );
      if (/404/.test(msg) || /session_not_found/i.test(msg)) {
        setSendErr("会话已失效或已结束,无法继续发送");
      } else {
        setSendErr("上传失败:" + msg);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setSendErr(null);
    try {
      const m = await reply(agentId, sessionId, t);
      upsert(m);
      setDraft("");
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      console.error("[reply]", err);
      // 后端 404 时(会话已失效)给清晰提示而非沉默
      if (/404/.test(msg) || /session_not_found/i.test(msg)) {
        setSendErr("会话已失效或已结束,无法继续发送");
      } else {
        setSendErr("发送失败:" + msg);
      }
      // 草稿不清,让坐席能改一改重试
    }
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // 只在离开外层(target == currentTarget)才清,防止子元素冒泡误清
    if (e.target === e.currentTarget) setDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void sendMedia(f);
  };

  return (
    <GlassCard
      strength="base"
      radius={16}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        outline: dragOver ? "2px dashed var(--color-primary)" : undefined,
        outlineOffset: dragOver ? -6 : 0,
      }}
    >
      {dragOver ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
            color: "var(--color-primary)",
            fontSize: 14,
            fontWeight: 600,
            pointerEvents: "none",
          }}
        >
          松开发送图片 / 文件
        </div>
      ) : null}
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
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>加载中…</span>
        ) : null}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          {readOnly ? (
            <>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                  color: "var(--color-text-secondary)",
                }}
              >
                AI 托管中(只读)
              </span>
              {extraActions}
            </>
          ) : (
            <>
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
            </>
          )}
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

      {!readOnly ? <AiSuggestionRow sessionId={sessionId} onPick={setDraft} /> : null}

      {!readOnly && suggestedReplies && suggestedReplies.length > 0 ? (
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
            <Capsule
              key={i}
              size="sm"
              variant="ghost"
              title="点击填入下方编辑框,可改后再发"
              onClick={() => setDraft(s)}
            >
              {s}
            </Capsule>
          ))}
        </div>
      ) : null}

      {!readOnly && sendErr ? (
        <div
          role="alert"
          style={{
            padding: "6px 12px",
            background: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            color: "var(--color-danger)",
            fontSize: 12,
            borderTop: "1px solid var(--color-border)",
          }}
        >
          ⚠ {sendErr}
        </div>
      ) : null}

      {!readOnly ? (
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
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            accept="image/*,application/pdf,text/plain,video/mp4"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendMedia(f);
            }}
          />
          <Capsule
            size="md"
            variant="ghost"
            title="发图片 / 文件"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "上传中…" : "📎"}
          </Capsule>
          <Capsule size="md" variant="primary" onClick={() => send(draft)} disabled={!draft.trim()}>
            发送
          </Capsule>
        </div>
      ) : null}
    </GlassCard>
  );
}

function Row({ m }: { m: MessageView }) {
  const text = String(m.content?.text ?? "");
  if (m.role === "system") {
    return <Bubble role="system">{text}</Bubble>;
  }
  const isAgent = m.role === "agent";
  const showRag =
    m.role === "ai" &&
    Array.isArray(m.aiMeta?.rag_chunks) &&
    (m.aiMeta?.rag_chunks?.length ?? 0) > 0;
  const showTools =
    m.role === "ai" &&
    Array.isArray(m.aiMeta?.tool_calls) &&
    (m.aiMeta?.tool_calls?.length ?? 0) > 0;
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
          {m.type === "image" ? (
            <MediaImage content={m.content} />
          ) : m.type === "file" ? (
            <MediaFile content={m.content} />
          ) : (
            <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
          )}
        </Bubble>
        {showRag ? <RagInlineRef meta={m.aiMeta as AiMeta} /> : null}
        {showTools ? <ToolInlineRef meta={m.aiMeta as AiMeta} /> : null}
      </div>
    </div>
  );
}

function MediaImage({ content }: { content?: MessageView["content"] }) {
  const url = typeof content?.url === "string" ? content.url : "";
  const fname = typeof content?.filename === "string" ? content.filename : "image";
  const progress = typeof content?.progress === "number" ? content.progress : undefined;
  const uploading = content?.uploading === true;
  const error = typeof content?.error === "string" ? content.error : "";
  if (!url) return <span style={{ color: "var(--color-text-tertiary)" }}>[图片缺 url]</span>;
  const dimmed = uploading || progress != null;
  return (
    <span style={{ display: "inline-block", position: "relative" }}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (dimmed || error) e.preventDefault();
        }}
        style={{ display: "inline-block" }}
      >
        <img
          src={url}
          alt={fname}
          style={{
            maxWidth: 240,
            maxHeight: 240,
            borderRadius: 8,
            display: "block",
            objectFit: "cover",
            opacity: error ? 0.5 : dimmed ? 0.7 : 1,
            filter: error ? "grayscale(60%)" : undefined,
          }}
        />
      </a>
      {progress != null && progress < 100 ? (
        <span
          style={{
            position: "absolute",
            inset: "auto 0 0 0",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: "0 0 8px 8px",
          }}
        >
          上传 {progress}%
        </span>
      ) : null}
      {error ? (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            fontSize: 12,
            borderRadius: 8,
            padding: 4,
            textAlign: "center",
          }}
          title={error}
        >
          ⚠ 上传失败
        </span>
      ) : null}
    </span>
  );
}

function MediaFile({ content }: { content?: MessageView["content"] }) {
  const url = typeof content?.url === "string" ? content.url : "";
  const fname = typeof content?.filename === "string" ? content.filename : "file";
  const size = typeof content?.size === "number" ? content.size : 0;
  const progress = typeof content?.progress === "number" ? content.progress : undefined;
  const uploading = content?.uploading === true;
  const error = typeof content?.error === "string" ? content.error : "";
  const sizeLabel =
    size > 0
      ? size > 1024 * 1024
        ? `${(size / 1024 / 1024).toFixed(1)} MB`
        : `${Math.max(1, Math.round(size / 1024))} KB`
      : "";
  const sub = error
    ? `⚠ ${error.length > 40 ? error.slice(0, 40) + "…" : error}`
    : progress != null && progress < 100
      ? `上传 ${progress}%`
      : sizeLabel;
  return (
    <a
      href={uploading || error ? "#" : url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (uploading || error) e.preventDefault();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        textDecoration: "none",
        color: "inherit",
        padding: "4px 6px",
        opacity: error ? 0.6 : uploading ? 0.85 : 1,
      }}
    >
      <span aria-hidden style={{ fontSize: 18 }}>
        {error ? "⚠" : "📎"}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13 }}>{fname}</span>
        {sub ? (
          <span
            style={{
              fontSize: 11,
              color: error ? "var(--color-danger)" : "var(--color-text-tertiary)",
            }}
          >
            {sub}
          </span>
        ) : null}
      </span>
    </a>
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
      引用 {chunks.length} 条{meta.rag_top_title ? ` · 主要来自《${meta.rag_top_title}》` : ""}
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
  const [fetched, setFetched] = useState(false);

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
      setFetched(true);
    }
  };

  useEffect(() => {
    setSuggestions([]);
    setErr(null);
    setFetched(false);
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
        background: "color-mix(in srgb, var(--color-primary) 4%, var(--color-surface-alt))",
      }}
    >
      <span style={{ color: "var(--color-text-secondary)", fontSize: 12, flex: "none" }}>
        ✨ AI 建议:
      </span>
      {suggestions.length === 0 && !loading ? (
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          {err
            ? `失败:${err}`
            : fetched
              ? "AI 暂未给出候选(对话历史太少 / 模型超时),可重试"
              : "点「生成」让 AI 给候选"}
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
      <Capsule size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
        {suggestions.length > 0 ? "重新生成" : "生成"}
      </Capsule>
    </div>
  );
}
