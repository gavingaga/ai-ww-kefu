import { Capsule, GlassCard } from "@ai-kefu/ui-glass";
import { useEffect, useState } from "react";

import {
  listAdminAgents,
  listSkillGroups,
  updateAdminAgent,
  type AdminAgentView,
  type SkillGroupView,
} from "../api/client.js";

/** 坐席档案 — 列表 + 编辑(昵称 / 技能组 / 并发 / 角色)。 */
export function AgentsPanel() {
  const [rows, setRows] = useState<AdminAgentView[]>([]);
  const [groups, setGroups] = useState<SkillGroupView[]>([]);
  const [editing, setEditing] = useState<AdminAgentView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    setErr(null);
    Promise.all([listAdminAgents(), listSkillGroups()])
      .then(([a, g]) => {
        setRows(a);
        setGroups(g);
      })
      .catch((e: unknown) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <section style={{ padding: 24, height: "100%", overflow: "auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>坐席档案</h2>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          共 {rows.length} 名{loading ? "  · 加载中" : ""}
        </span>
        <Capsule size="sm" variant="ghost" onClick={refresh}>
          刷新
        </Capsule>
      </header>
      {err ? (
        <div style={{ color: "var(--color-danger, #d33)", fontSize: 12, marginTop: 8 }}>
          ⚠ {err}
        </div>
      ) : null}

      <GlassCard radius={12} style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-surface-alt)" }}>
              <Th>ID</Th>
              <Th>昵称</Th>
              <Th>角色</Th>
              <Th>技能组</Th>
              <Th>负载</Th>
              <Th>状态</Th>
              <Th align="right">操作</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: 16, color: "var(--color-text-tertiary)", textAlign: "center" }}
                >
                  尚无坐席。可在「用户管理」邀请用户并填关联 Agent ID,然后让坐席登录工作台自动注册。
                </td>
              </tr>
            ) : null}
            {rows.map((a) => {
              const load = a.activeSessionIds?.length ?? 0;
              const max = a.maxConcurrency ?? 0;
              return (
                <tr key={a.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <Td mono>{a.id}</Td>
                  <Td>{a.nickname ?? "—"}</Td>
                  <Td>{a.role ?? "AGENT"}</Td>
                  <Td>{(a.skillGroups ?? []).join(", ") || "—"}</Td>
                  <Td mono>
                    {load}/{max}
                  </Td>
                  <Td>{a.status ?? "OFFLINE"}</Td>
                  <Td align="right">
                    <Capsule size="sm" variant="ghost" onClick={() => setEditing(a)}>
                      编辑
                    </Capsule>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassCard>

      {editing ? (
        <EditDialog
          agent={editing}
          allGroups={groups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function EditDialog({
  agent,
  allGroups,
  onClose,
  onSaved,
}: {
  agent: AdminAgentView;
  allGroups: SkillGroupView[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nickname, setNickname] = useState(agent.nickname ?? "");
  const [role, setRole] = useState(agent.role ?? "AGENT");
  const [maxConc, setMaxConc] = useState(String(agent.maxConcurrency ?? 5));
  const [skills, setSkills] = useState<Set<string>>(new Set(agent.skillGroups ?? []));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await updateAdminAgent(agent.id, {
        nickname,
        role: role as "AGENT" | "SUPERVISOR",
        maxConcurrency: Number(maxConc) || 5,
        skillGroups: Array.from(skills),
      });
      onSaved();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "90vw",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14 }}>编辑坐席 — id {agent.id}</h3>
        <Field label="昵称">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="角色">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "AGENT" | "SUPERVISOR")}
            style={inputStyle}
          >
            <option value="AGENT">AGENT</option>
            <option value="SUPERVISOR">SUPERVISOR</option>
          </select>
        </Field>
        <Field label="最大并发会话">
          <input
            type="number"
            min={1}
            max={50}
            value={maxConc}
            onChange={(e) => setMaxConc(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="技能组(可多选)">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allGroups.length === 0 ? (
              <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>暂无技能组</span>
            ) : null}
            {allGroups.map((g) => {
              const checked = skills.has(g.code);
              const disabled = !g.active && !checked;
              return (
                <label
                  key={g.code}
                  title={`${g.name ?? g.code} · 优先级 ${g.priority ?? 100} · SLA ${g.slaSeconds ?? 0}s`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    padding: "4px 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: 999,
                    background: checked
                      ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
                      : "transparent",
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = new Set(skills);
                      if (e.target.checked) next.add(g.code);
                      else next.delete(g.code);
                      setSkills(next);
                    }}
                  />
                  {g.code}
                </label>
              );
            })}
          </div>
        </Field>
        {err ? (
          <span style={{ color: "var(--color-danger, #d33)", fontSize: 12 }}>{err}</span>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <Capsule size="sm" variant="ghost" onClick={onClose}>
            取消
          </Capsule>
          <Capsule size="sm" variant="primary" onClick={submit} disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </Capsule>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{label}</span>
      {children}
    </label>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "8px 12px",
        fontSize: 11,
        color: "var(--color-text-tertiary)",
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "10px 12px",
        textAlign: align ?? "left",
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    >
      {children}
    </td>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "6px 10px",
  background: "var(--color-surface-alt)",
  color: "var(--color-text-primary)",
  outline: "none",
  font: "inherit",
  fontSize: 13,
};
