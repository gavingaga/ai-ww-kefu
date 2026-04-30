import { Capsule, GlassCard } from "@ai-kefu/ui-glass";
import { useEffect, useState } from "react";

import {
  inviteUser,
  listAdminUsers,
  resetUserPassword,
  setUserDisabled,
  setUserRoles,
  type AdminUserView,
} from "../api/client.js";

const ALL_ROLES = ["owner", "admin", "supervisor", "agent", "viewer", "developer"];

/** 用户管理 — 列表 + 邀请 + 启停 + 重置密码 + 改角色。 */
export function UsersPanel() {
  const [rows, setRows] = useState<AdminUserView[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<AdminUserView | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setErr(null);
    listAdminUsers()
      .then((r) => setRows(r.items))
      .catch((e: unknown) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const onToggleDisabled = async (u: AdminUserView) => {
    try {
      await setUserDisabled(u.id, !u.disabled);
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  const onResetPassword = async (u: AdminUserView) => {
    if (!confirm(`确认重置 ${u.username ?? u.email} 的密码?`)) return;
    try {
      const r = await resetUserPassword(u.id);
      setToast(`新密码:${r.temporary_password}(请立即转交并改密)`);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  return (
    <section style={{ padding: 24, height: "100%", overflow: "auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>用户管理</h2>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          共 {rows.length} 人{loading ? "  · 加载中" : ""}
        </span>
        <Capsule size="sm" variant="ghost" onClick={refresh}>
          刷新
        </Capsule>
        <Capsule size="sm" variant="primary" onClick={() => setShowInvite(true)}>
          + 邀请用户
        </Capsule>
      </header>

      {err ? (
        <div style={{ color: "var(--color-danger, #d33)", fontSize: 12, marginTop: 8 }}>
          ⚠ {err}
        </div>
      ) : null}
      {toast ? (
        <div
          style={{
            background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "8px 12px",
            marginTop: 8,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      <GlassCard radius={12} style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-surface-alt)" }}>
              <Th>ID</Th>
              <Th>用户名</Th>
              <Th>邮箱</Th>
              <Th>显示名</Th>
              <Th>角色</Th>
              <Th>关联坐席</Th>
              <Th>状态</Th>
              <Th>最后登录</Th>
              <Th align="right">操作</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                <Td mono>{u.id}</Td>
                <Td>{u.username ?? "—"}</Td>
                <Td>{u.email ?? "—"}</Td>
                <Td>{u.displayName ?? "—"}</Td>
                <Td>{(u.roles ?? []).join(", ")}</Td>
                <Td mono>{u.agentId ? u.agentId : "—"}</Td>
                <Td>
                  {u.disabled ? (
                    <span style={{ color: "var(--color-danger, #d33)" }}>已停用</span>
                  ) : (
                    <span style={{ color: "var(--color-success, #34c759)" }}>启用</span>
                  )}
                </Td>
                <Td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}</Td>
                <Td align="right">
                  <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                    <Capsule size="sm" variant="ghost" onClick={() => setEditing(u)}>
                      角色
                    </Capsule>
                    <Capsule size="sm" variant="ghost" onClick={() => onResetPassword(u)}>
                      重置密码
                    </Capsule>
                    <Capsule size="sm" variant="ghost" onClick={() => onToggleDisabled(u)}>
                      {u.disabled ? "启用" : "停用"}
                    </Capsule>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      {showInvite ? (
        <InviteDialog
          onClose={() => setShowInvite(false)}
          onSaved={() => {
            setShowInvite(false);
            refresh();
          }}
        />
      ) : null}
      {editing ? (
        <RolesDialog
          user={editing}
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

function InviteDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [agentId, setAgentId] = useState("");
  const [roles, setRoles] = useState<Set<string>>(new Set(["agent"]));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username && !email) {
      setErr("用户名或邮箱至少一个非空");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await inviteUser({
        username: username || undefined,
        email: email || undefined,
        displayName: displayName || undefined,
        password: password || undefined,
        roles: Array.from(roles),
        agentId: agentId ? Number(agentId) : undefined,
      });
      onSaved();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="邀请用户" onClose={onClose}>
      <Field label="用户名">
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="邮箱">
        <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="显示名">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="初始密码(留空随机)">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="关联 Agent ID(0 表纯管理员)">
        <input value={agentId} onChange={(e) => setAgentId(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="角色(可多选)">
        <RoleCheckboxes value={roles} onChange={setRoles} />
      </Field>
      {err ? <span style={{ color: "var(--color-danger, #d33)", fontSize: 12 }}>{err}</span> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <Capsule size="sm" variant="ghost" onClick={onClose}>
          取消
        </Capsule>
        <Capsule size="sm" variant="primary" onClick={submit} disabled={busy}>
          {busy ? "提交中…" : "邀请"}
        </Capsule>
      </div>
    </Modal>
  );
}

function RolesDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUserView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<Set<string>>(new Set(user.roles ?? []));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await setUserRoles(user.id, Array.from(roles));
      onSaved();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`改角色 — ${user.username ?? user.email}`} onClose={onClose}>
      <RoleCheckboxes value={roles} onChange={setRoles} />
      {err ? <span style={{ color: "var(--color-danger, #d33)", fontSize: 12 }}>{err}</span> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <Capsule size="sm" variant="ghost" onClick={onClose}>
          取消
        </Capsule>
        <Capsule size="sm" variant="primary" onClick={submit} disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </Capsule>
      </div>
    </Modal>
  );
}

function RoleCheckboxes({
  value,
  onChange,
}: {
  value: Set<string>;
  onChange: (v: Set<string>) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {ALL_ROLES.map((r) => {
        const checked = value.has(r);
        return (
          <label
            key={r}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                const next = new Set(value);
                if (e.target.checked) next.add(r);
                else next.delete(r);
                onChange(next);
              }}
            />
            {r}
          </label>
        );
      })}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
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
          width: 460,
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
        <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
        {children}
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
