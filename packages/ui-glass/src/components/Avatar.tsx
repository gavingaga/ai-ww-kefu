import type { CSSProperties, HTMLAttributes } from "react";

import { cx } from "../utils/cx.js";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  src?: string;
  alt?: string;
  size?: number;
  /** 流光呼吸边框(AI 状态) */
  breathing?: boolean;
  /** 占位文本(无 src 时取首字符) */
  fallback?: string;
}

export function Avatar({
  src,
  alt = "",
  size = 32,
  breathing,
  fallback,
  className,
  style,
  ...rest
}: AvatarProps) {
  const merged: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size,
    height: size,
    borderRadius: "50%",
    overflow: "hidden",
    background: "var(--bubble-agent)",
    color: "var(--color-text-secondary)",
    fontSize: Math.round(size * 0.42),
    fontWeight: 600,
    flex: "none",
    position: "relative",
    boxShadow: breathing
      ? "0 0 0 0 color-mix(in srgb, var(--bubble-ai-from) 60%, transparent)"
      : undefined,
    animation: breathing ? "aikefu-avatar-breath 1.6s ease-in-out infinite" : undefined,
    ...style,
  };

  return (
    <span className={cx("aikefu-avatar", className)} style={merged} {...rest}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span aria-hidden>{(fallback ?? alt).slice(0, 1).toUpperCase() || "·"}</span>
      )}
      <style>{`
        @keyframes aikefu-avatar-breath {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--bubble-ai-from) 0%, transparent); }
          50%     { box-shadow: 0 0 0 6px color-mix(in srgb, var(--bubble-ai-from) 30%, transparent); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aikefu-avatar { animation: none !important; box-shadow: none !important; }
        }
      `}</style>
    </span>
  );
}
