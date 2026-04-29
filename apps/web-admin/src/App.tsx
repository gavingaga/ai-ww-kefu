import { useState } from "react";

import type { AdminRole } from "./api/types.js";
import { clearSession, loadSession, type AdminSession } from "./auth/session.js";
import { AuditPanel } from "./components/AuditPanel.js";
import { DashboardPanel } from "./components/DashboardPanel.js";
import { DecisionPlaygroundPanel } from "./components/DecisionPlaygroundPanel.js";
import { FaqPanel } from "./components/FaqPanel.js";
import { KbDebugPanel } from "./components/KbDebugPanel.js";
import { KbIngestPanel } from "./components/KbIngestPanel.js";
import { LlmProfilesPanel } from "./components/LlmProfilesPanel.js";
import { LoginGate } from "./components/LoginGate.js";
import { NoticesPanel } from "./components/NoticesPanel.js";
import { PromptsPanel } from "./components/PromptsPanel.js";
import { ReportsPanel } from "./components/ReportsPanel.js";
import { ToolPlaygroundPanel } from "./components/ToolPlaygroundPanel.js";

type Page =
  | "dashboard"
  | "reports"
  | "audit"
  | "notices"
  | "kb-debug"
  | "kb-ingest"
  | "faq"
  | "tools"
  | "llm"
  | "prompts"
  | "decision";

interface NavItem {
  key: Page;
  label: string;
  hint: string;
  /** 允许查看本页的最低角色:ADMIN(全部)< SUPERVISOR < AGENT */
  minRole: AdminRole;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "运营看板", hint: "队列 / 坐席 / 负载实时态", minRole: "AGENT" },
  { key: "reports", label: "运营报表", hint: "KPI / CSAT / 工具 / 坐席 / 转人工", minRole: "SUPERVISOR" },
  { key: "audit", label: "审计流水", hint: "主管干预 / 坐席动作记录", minRole: "SUPERVISOR" },
  { key: "notices", label: "公告 / 快捷按钮", hint: "运营 CRUD", minRole: "ADMIN" },
  { key: "kb-debug", label: "KB 检索调试", hint: "向量 / BM25 / RRF / Rerank 调参", minRole: "ADMIN" },
  { key: "kb-ingest", label: "KB 入库", hint: "新增文档 → 切片 + 嵌入", minRole: "ADMIN" },
  { key: "faq", label: "FAQ 节点管理", hint: "树编辑 + 命中模拟器", minRole: "ADMIN" },
  { key: "tools", label: "工具调试器", hint: "tool-svc invoke,验参数 / dry_run", minRole: "ADMIN" },
  { key: "llm", label: "LLM 档位", hint: "增删改 + 试聊 + 配额", minRole: "ADMIN" },
  { key: "prompts", label: "Prompt A/B", hint: "scene / version 并排预览", minRole: "ADMIN" },
  { key: "decision", label: "决策预览", hint: "看用户语会走哪条路", minRole: "SUPERVISOR" },
];

const ROLE_RANK: Record<AdminRole, number> = { ADMIN: 3, SUPERVISOR: 2, AGENT: 1 };

function canSee(role: AdminRole, item: NavItem): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[item.minRole];
}

export function App() {
  const [session, setSession] = useState<AdminSession | null>(loadSession);
  const [page, setPage] = useState<Page>("dashboard");

  if (!session) {
    return <LoginGate onLogin={setSession} />;
  }

  const allowed = NAV.filter((n) => canSee(session.role, n));
  // 当前 page 不在 allowed 时回到 dashboard
  const currentPage = allowed.some((n) => n.key === page) ? page : (allowed[0]?.key ?? "dashboard");

  const onLogout = () => {
    clearSession();
    setSession(null);
  };

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
        {allowed.map((n) => {
          const active = currentPage === n.key;
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
          <div style={{ marginBottom: 6 }}>
            <strong>{session.username}</strong> · {session.role}
          </div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              border: "1px solid var(--color-border)",
              background: "transparent",
              borderRadius: 8,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 11,
              color: "var(--color-text-secondary)",
            }}
          >
            登出
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        {currentPage === "dashboard" ? <DashboardPanel /> : null}
        {currentPage === "reports" ? <ReportsPanel /> : null}
        {currentPage === "audit" ? <AuditPanel /> : null}
        {currentPage === "notices" ? <NoticesPanel /> : null}
        {currentPage === "kb-debug" ? <KbDebugPanel /> : null}
        {currentPage === "kb-ingest" ? <KbIngestPanel /> : null}
        {currentPage === "faq" ? <FaqPanel /> : null}
        {currentPage === "tools" ? <ToolPlaygroundPanel /> : null}
        {currentPage === "llm" ? <LlmProfilesPanel /> : null}
        {currentPage === "prompts" ? <PromptsPanel /> : null}
        {currentPage === "decision" ? <DecisionPlaygroundPanel /> : null}
      </main>
    </div>
  );
}
