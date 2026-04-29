import { Capsule } from "@ai-kefu/ui-glass";

import type { QuickReply } from "../mocks/data.js";

export interface QuickRepliesProps {
  items: QuickReply[];
  onSend: (payload: string) => void;
}

export function QuickReplies({ items, onSend }: QuickRepliesProps) {
  return (
    <div
      style={{
        padding: "8px 12px",
        overflowX: "auto",
        whiteSpace: "nowrap",
        display: "flex",
        gap: 8,
        scrollbarWidth: "none",
      }}
      // 隐藏 webkit 滚动条
      onWheel={(e) => {
        // PC 鼠标滚轮 → 横向滚动
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.currentTarget.scrollLeft += e.deltaY;
        }
      }}
    >
      {items.map((q) => (
        <Capsule
          key={q.id}
          variant="ghost"
          size="sm"
          onClick={() => {
            // T-403 数据回流:点击计数,fire-and-forget
            void fetch(`/v1/quick-replies/${encodeURIComponent(String(q.id))}/click`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ scene: q.scene }),
            }).catch(() => {});
            onSend(q.payload);
          }}
          title={q.payload}
        >
          {q.icon ? <span style={{ marginRight: 4 }}>{q.icon}</span> : null}
          {q.label}
        </Capsule>
      ))}
      <style>{`div::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}
