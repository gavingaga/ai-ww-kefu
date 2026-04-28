import { useState } from "react";

import { Avatar } from "@ai-kefu/ui-glass";

import type { RagCitationContent } from "../mocks/data.js";

/**
 * AI 答复下方的"📚 引用 N 条"折叠卡片 — 来自 kb-svc Hybrid 检索的 chunks。
 */
export function RagCitation({ rag }: { rag: RagCitationContent }) {
  const [open, setOpen] = useState(false);
  if (!rag.chunks?.length) return null;
  const n = rag.chunks.length;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <Avatar size={24} fallback="📚" alt="知识库引用" />
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          maxWidth: "82%",
          textAlign: "left",
          padding: "8px 12px",
          background: "var(--bubble-system)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-bubble)",
          color: "var(--color-text-primary)",
          fontSize: "var(--font-size-caption)",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          backdropFilter: "blur(var(--blur-glass-weak))",
          WebkitBackdropFilter: "blur(var(--blur-glass-weak))",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            color: "var(--color-text-secondary)",
          }}
        >
          <span aria-hidden>📖</span>
          <span>
            参考资料 {n} 条
            {rag.topTitle ? <span> · 主要来自《{rag.topTitle}》</span> : null}
          </span>
          <span style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }}>
            {open ? "收起" : "展开"}
          </span>
        </span>
        {open ? (
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {rag.chunks.map((c, i) => (
              <li key={c.chunk_id ?? i} style={{ marginBottom: 4 }}>
                {c.title ? (
                  <strong>{c.title}</strong>
                ) : (
                  <strong>chunk {i + 1}</strong>
                )}
                {typeof c.score === "number" ? (
                  <span style={{ marginLeft: 6, color: "var(--color-text-tertiary)" }}>
                    score {c.score.toFixed(2)}
                  </span>
                ) : null}
                <div
                  style={{
                    color: "var(--color-text-secondary)",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {(c.content ?? "").slice(0, 200)}
                  {(c.content?.length ?? 0) > 200 ? "…" : ""}
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </button>
    </div>
  );
}
