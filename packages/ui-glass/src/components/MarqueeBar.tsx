import { useEffect, useMemo, useRef, useState } from "react";

import { cx } from "../utils/cx.js";

export interface MarqueeItem {
  id: string | number;
  level?: "info" | "warning" | "critical";
  content: string;
  link?: string;
}

export interface MarqueeBarProps {
  items: MarqueeItem[];
  /** 滚动速度 px/s,默认 60 */
  speed?: number;
  /** 鼠标悬停暂停 */
  pauseOnHover?: boolean;
  /** 关闭按钮回调,关闭后由调用方决定是否进 localStorage 24h 不再显示 */
  onClose?: (item: MarqueeItem) => void;
  /** 点击单条 */
  onClick?: (item: MarqueeItem) => void;
  className?: string;
}

/**
 * 顶部公告跑马灯。
 * 用 requestAnimationFrame 实现匀速滚动,后台 tab 暂停;
 * 多条循环,critical 级别优先且红色高亮,详见 PRD §3.1。
 */
export function MarqueeBar({
  items,
  speed = 60,
  pauseOnHover = true,
  onClose,
  onClick,
  className,
}: MarqueeBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  // critical 排前
  const ordered = useMemo(() => {
    const weight = (l?: string) => (l === "critical" ? 0 : l === "warning" ? 1 : 2);
    return [...items].sort((a, b) => weight(a.level) - weight(b.level));
  }, [items]);

  useEffect(() => {
    if (!ordered.length) return;
    let raf = 0;
    const tick = (ts: number) => {
      if (!trackRef.current || !containerRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (paused || document.hidden) {
        lastTsRef.current = ts;
        raf = requestAnimationFrame(tick);
        return;
      }
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      offsetRef.current -= dt * speed;
      const trackWidth = trackRef.current.scrollWidth / 2;
      if (-offsetRef.current >= trackWidth) {
        offsetRef.current += trackWidth;
      }
      trackRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ordered, speed, paused]);

  if (!ordered.length) return null;

  const hasCritical = ordered[0]?.level === "critical";

  return (
    <div
      ref={containerRef}
      className={cx("aikefu-marquee", hasCritical && "is-critical", className)}
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
      role="region"
      aria-label="公告"
      style={{
        position: "relative",
        height: 44,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        background: hasCritical
          ? "color-mix(in srgb, var(--color-critical) 18%, var(--color-surface))"
          : "var(--color-surface)",
        backdropFilter: "blur(var(--blur-glass)) saturate(180%)",
        WebkitBackdropFilter: "blur(var(--blur-glass)) saturate(180%)",
        borderBottom: "1px solid var(--color-border)",
        color: "var(--color-text-primary)",
      }}
    >
      <div
        ref={trackRef}
        style={{
          display: "flex",
          gap: 48,
          whiteSpace: "nowrap",
          willChange: "transform",
          padding: "0 16px",
        }}
      >
        {[...ordered, ...ordered].map((it, idx) => (
          <span
            key={`${it.id}-${idx}`}
            onClick={() => onClick?.(it)}
            style={{
              cursor: onClick || it.link ? "pointer" : "default",
              fontSize: "var(--font-size-caption)",
            }}
          >
            {it.level === "critical" ? "⚠ " : it.level === "warning" ? "ⓘ " : "📣 "}
            {it.content}
          </span>
        ))}
      </div>
      {onClose && ordered[0]?.level !== "critical" && (
        <button
          aria-label="关闭公告"
          onClick={() => onClose(ordered[0]!)}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: 16,
            padding: 4,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
