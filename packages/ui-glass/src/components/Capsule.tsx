import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cx } from "../utils/cx.js";

export interface CapsuleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md";
}

/** 胶囊按钮(快捷按钮 / 输入区按钮 通用) */
export const Capsule = forwardRef<HTMLButtonElement, CapsuleProps>(function Capsule(
  { variant = "ghost", size = "md", className, style, children, ...rest },
  ref,
) {
  const padY = size === "sm" ? 6 : 8;
  const padX = size === "sm" ? 12 : 16;
  const fontSize = size === "sm" ? "var(--font-size-caption)" : "var(--font-size-body)";

  const palette =
    variant === "primary"
      ? {
          background: "var(--color-primary)",
          color: "#FFFFFF",
          border: "1px solid transparent",
        }
      : variant === "outline"
        ? {
            background: "transparent",
            color: "var(--color-primary)",
            border: "1px solid var(--color-primary)",
          }
        : {
            background: "var(--bubble-agent)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
            backdropFilter: "blur(var(--blur-glass-weak))",
            WebkitBackdropFilter: "blur(var(--blur-glass-weak))",
          };

  return (
    <button
      ref={ref}
      className={cx("aikefu-capsule", `is-${variant}`, `is-${size}`, className)}
      style={{
        padding: `${padY}px ${padX}px`,
        borderRadius: "var(--radius-capsule)",
        fontSize,
        cursor: rest.disabled ? "not-allowed" : "pointer",
        transition: "transform var(--motion-fast) var(--easing-standard)",
        ...palette,
        ...style,
      }}
      {...rest}
    >
      {children}
      <style>{`
        .aikefu-capsule:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) {
          .aikefu-capsule:active { transform: none; }
        }
      `}</style>
    </button>
  );
});
