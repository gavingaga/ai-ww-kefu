import { useState } from "react";

import { AuditPanel } from "./components/AuditPanel.js";
import { DashboardPanel } from "./components/DashboardPanel.js";
import { FaqPanel } from "./components/FaqPanel.js";
import { KbDebugPanel } from "./components/KbDebugPanel.js";
import { KbIngestPanel } from "./components/KbIngestPanel.js";

type Page = "dashboard" | "audit" | "kb-debug" | "kb-ingest" | "faq";

const NAV: Array<{ key: Page; label: string; hint: string }> = [
  { key: "dashboard", label: "运营看板", hint: "队列 / 坐席 / 负载实时态" },
  { key: "audit", label: "审计流水", hint: "主管干预 / 坐席动作记录" },
  { key: "kb-debug", label: "KB 检索调试", hint: "向量 / BM25 / RRF / Rerank 调参" },
  { key: "kb-ingest", label: "KB 入库", hint: "新增文档 → 切片 + 嵌入" },
  { key: "faq", label: "FAQ 节点管理", hint: "树编辑 + 命中模拟器" },
];

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <aside
        style={{
          width: 220,
          padding: "16px 12px",
          borderRight: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>客服管理后台</div>
        {NAV.map((n) => {
          const active = page === n.key;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => setPage(n.key)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: active ? "var(--color-primary, #0A84FF)" : "transparent",
                background: active ? "var(--color-surface-alt)" : "transparent",
                cursor: "pointer",
                color: "var(--color-text-primary)",
              }}
            >
              <div style={{ fontSize: 13 }}>{n.label}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{n.hint}</div>
            </button>
          );
        })}
        <div style={{ marginTop: "auto", fontSize: 11, color: "var(--color-text-tertiary)" }}>
          代理:agent-bff /v1/admin/*
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        {page === "dashboard" ? <DashboardPanel /> : null}
        {page === "audit" ? <AuditPanel /> : null}
        {page === "kb-debug" ? <KbDebugPanel /> : null}
        {page === "kb-ingest" ? <KbIngestPanel /> : null}
        {page === "faq" ? <FaqPanel /> : null}
      </main>
    </div>
  );
}
