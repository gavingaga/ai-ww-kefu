import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cx } from "../utils/cx.js";

export type BubbleRole = "user" | "ai" | "agent" | "system";

export interface BubbleProps extends HTMLAttributes<HTMLDivElement> {
  role: BubbleRole;
  /** 是否带流式 AI 流光效果(thinking) */
  thinking?: boolean;
  children?: ReactNode;
}

/**
 * 消息气泡 — 三种主体角色 + 系统消息样式。
 * - user: System Blue 实色,右对齐
 * - ai:   紫色渐变玻璃,左对齐;thinking 时边缘呼吸光
 * - agent:中性灰玻璃,左对齐
 * - system: 居中胶囊,弱对比
 */
export function Bubble({ role, thinking, className, style, children, ...rest }: BubbleProps) {
  const base: CSSProperties = {
    borderRadius: "var(--radius-bubble)",
    padding: "10px 14px",
    maxWidth: "78%",
    fontSize: "var(--font-size-body)",
    lineHeight: 1.5,
    boxShadow: "var(--shadow-card)",
    ...style,
  };

  let roleStyle: CSSProperties = {};
  let alignSelf: CSSProperties["alignSelf"] = "flex-start";

  if (role === "user") {
    roleStyle = {
      background: "var(--bubble-user)",
      color: "#FFFFFF",
    };
    alignSelf = "flex-end";
  } else if (role === "agent") {
    roleStyle = {
      background: "var(--bubble-agent)",
      color: "var(--color-text-primary)",
      backdropFilter: "blur(var(--blur-glass-weak))",
      WebkitBackdropFilter: "blur(var(--blur-glass-weak))",
    };
  } else if (role === "ai") {
    roleStyle = {
      background:
        "linear-gradient(135deg, color-mix(in srgb, var(--bubble-ai-from) 28%, transparent), color-mix(in srgb, var(--bubble-ai-to) 28%, transparent))",
      color: "var(--color-text-primary)",
      backdropFilter: "blur(var(--blur-glass)) saturate(180%)",
      WebkitBackdropFilter: "blur(var(--blur-glass)) saturate(180%)",
      border: "1px solid var(--color-border)",
      position: "relative",
    };
  } else {
    // system
    roleStyle = {
      background: "var(--bubble-system)",
      color: "var(--color-text-secondary)",
      borderRadius: "var(--radius-capsule)",
      padding: "6px 12px",
      fontSize: "var(--font-size-caption)",
      maxWidth: "92%",
    };
    alignSelf = "center";
  }

  return (
    <div
      className={cx("aikefu-bubble", `aikefu-bubble--${role}`, thinking && "is-thinking", className)}
      style={{ ...base, ...roleStyle, alignSelf }}
      data-role={role}
      data-thinking={thinking ? "true" : undefined}
      {...rest}
    >
      {children}
      {thinking && role === "ai" ? <ThinkingDots /> : null}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span
      aria-label="AI 正在思考"
      style={{
        display: "inline-flex",
        gap: 4,
        marginLeft: 6,
        verticalAlign: "middle",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.35,
            animation: "aikefu-breath 1.4s var(--easing-breathing) infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes aikefu-breath {
          0%, 100% { opacity: 0.35; transform: translateY(0); }
          50%      { opacity: 1.0;  transform: translateY(-1px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aikefu-bubble.is-thinking span { animation: none !important; opacity: 0.6 !important; }
        }
      `}</style>
    </span>
  );
}
