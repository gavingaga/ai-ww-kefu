import type { CSSProperties } from "react";

import { cx } from "../utils/cx.js";

export interface FaqNodeData {
  id: string;
  title: string;
  icon?: string;
  is_leaf?: boolean;
}

export interface FaqNodeProps {
  node: FaqNodeData;
  onSelect?: (node: FaqNodeData) => void;
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * 单个 FAQ 节点项 — 列表中使用。
 * 叶子节点显示 ›,非叶子显示 chevron;命中后短暂高亮(由父级控制 active)。
 */
export function FaqNode({ node, onSelect, active, className, style }: FaqNodeProps) {
  return (
    <button
      onClick={() => onSelect?.(node)}
      className={cx("aikefu-faq-node", active && "is-active", className)}
      style={{
        width: "100%",
        minHeight: 48,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: "var(--radius-button)",
        border: "1px solid var(--color-border)",
        background: active
          ? "color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))"
          : "var(--color-surface)",
        color: "var(--color-text-primary)",
        textAlign: "left",
        cursor: "pointer",
        transition: "background var(--motion-fast) var(--easing-standard)",
        ...style,
      }}
    >
      {node.icon ? (
        <span style={{ fontSize: 18, flex: "none" }} aria-hidden>
          {node.icon}
        </span>
      ) : null}
      <span style={{ flex: 1, fontSize: "var(--font-size-body)" }}>{node.title}</span>
      <span aria-hidden style={{ color: "var(--color-text-tertiary)" }}>
        {node.is_leaf ? "›" : "›"}
      </span>
    </button>
  );
}
