import { useState } from "react";

import { Capsule } from "@ai-kefu/ui-glass";

import type { CsatContent } from "../mocks/data.js";

export interface CsatBubbleProps {
  csat: CsatContent;
  onSubmit: (input: { rating: number; tags: string[]; comment?: string }) => void;
}

const DEFAULT_TAGS_BY_RATING: Record<number, string[]> = {
  1: ["响应慢", "没解决", "态度差", "推销"],
  2: ["不够清晰", "信息不准", "等太久"],
  3: ["普通", "勉强可用"],
  4: ["响应快", "解决了"],
  5: ["专业", "很热情", "效率高"],
};

/** 满意度评价气泡 — 30s 内可重新评价。 */
export function CsatBubble({ csat, onSubmit }: CsatBubbleProps) {
  const [rating, setRating] = useState(csat.rating || 0);
  const [tags, setTags] = useState<string[]>(csat.tags ?? []);
  const [comment, setComment] = useState(csat.comment ?? "");

  const submitted = (csat.submittedAt ?? 0) > 0;
  const reviseDeadlineMs = (csat.submittedAt ?? 0) + 30_000;
  const canRevise = submitted && Date.now() < reviseDeadlineMs;
  const locked = submitted && !canRevise;

  const suggested = (csat.suggestedTags && csat.suggestedTags.length > 0)
    ? csat.suggestedTags
    : (DEFAULT_TAGS_BY_RATING[rating] ?? []);

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = () => {
    if (rating < 1 || locked) return;
    onSubmit({ rating, tags, comment: comment.trim() || undefined });
  };

  return (
    <div
      style={{
        alignSelf: "center",
        maxWidth: "82%",
        padding: 12,
        background: "var(--bubble-system)",
        backdropFilter: "blur(var(--blur-glass-weak))",
        WebkitBackdropFilter: "blur(var(--blur-glass-weak))",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-bubble)",
        color: "var(--color-text-primary)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500 }}>
        {locked ? "感谢您的评价 ✨" : submitted ? "已提交,30s 内可修改" : "本次服务怎么样?"}
      </div>
      <div style={{ display: "flex", gap: 6, fontSize: 24 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => !locked && setRating(n)}
            disabled={locked}
            aria-label={`${n} 星`}
            style={{
              border: "none",
              background: "transparent",
              cursor: locked ? "default" : "pointer",
              color: n <= rating ? "#f7c948" : "var(--color-text-tertiary)",
              padding: 0,
              transition: "transform 0.1s",
              transform: !locked && n <= rating ? "scale(1.1)" : "scale(1)",
            }}
          >
            ★
          </button>
        ))}
      </div>
      {rating > 0 && !locked ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggested.map((t) => (
            <Capsule
              key={t}
              size="sm"
              variant={tags.includes(t) ? "primary" : "ghost"}
              onClick={() => toggleTag(t)}
            >
              {t}
            </Capsule>
          ))}
        </div>
      ) : null}
      {rating > 0 && !locked ? (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="可写点意见(选填,200 字内)"
          maxLength={200}
          rows={2}
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "var(--color-surface-alt)",
            outline: "none",
            font: "inherit",
            fontSize: 13,
            color: "var(--color-text-primary)",
            resize: "vertical",
          }}
        />
      ) : null}
      {!locked ? (
        <div style={{ display: "flex", gap: 6 }}>
          <Capsule
            size="sm"
            variant="primary"
            onClick={submit}
            disabled={rating < 1}
          >
            {submitted ? "重新提交" : "提交评价"}
          </Capsule>
          {submitted ? (
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", alignSelf: "center" }}>
              30s 内可修改
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
