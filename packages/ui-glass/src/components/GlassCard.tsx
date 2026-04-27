import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

import { cx } from "../utils/cx.js";

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** 玻璃强度,默认 base */
  strength?: "weak" | "base" | "strong";
  /** 是否带 1px 高光描边,默认 true */
  ring?: boolean;
  /** 圆角覆写,默认走 design-tokens 的 --radius-card */
  radius?: number | string;
  children?: ReactNode;
}

/**
 * 玻璃材质容器(Glassmorphism)。
 * 使用 backdrop-filter 实现透明 + 高斯模糊,落到设计令牌的 CSS 变量,
 * 暗色模式自动跟随,reduced-motion 下无副作用。
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { strength = "base", ring = true, radius, className, style, children, ...rest },
  ref,
) {
  const blurVar =
    strength === "weak"
      ? "var(--blur-glass-weak)"
      : strength === "strong"
        ? "var(--blur-glass-strong)"
        : "var(--blur-glass)";

  const styleMerged: CSSProperties = {
    backgroundColor: "var(--color-surface)",
    border: ring ? "1px solid var(--color-border)" : "none",
    borderRadius: typeof radius === "number" ? `${radius}px` : (radius ?? "var(--radius-card)"),
    boxShadow: "var(--shadow-glass)",
    backdropFilter: `blur(${blurVar}) saturate(180%)`,
    WebkitBackdropFilter: `blur(${blurVar}) saturate(180%)`,
    ...style,
  };

  return (
    <div ref={ref} className={cx("aikefu-glass-card", className)} style={styleMerged} {...rest}>
      {children}
    </div>
  );
});
