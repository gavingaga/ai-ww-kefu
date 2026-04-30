import { Capsule, GlassCard } from "@ai-kefu/ui-glass";
import { useEffect, useState } from "react";

import {
  createSkillGroup,
  deactivateSkillGroup,
  listSkillGroups,
  updateSkillGroup,
  type SkillGroupView,
} from "../api/client.js";

/** 技能组管理 — 列表 + 新建 / 编辑(code 锁定)+ 优先级调整 + 软删。 */
export function SkillGroupsPanel() {
  const [rows, setRows] = useState<SkillGroupView[]>([]);
  const [editing, setEditing] = useState<SkillGroupView | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    setErr(null);
    listSkillGroups()
      .then(setRows)
      .catch((e: unknown) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const bumpPriority = async (g: SkillGroupView, delta: number) => {
    try {
      await updateSkillGroup(g.id, {
        priority: Math.max(0, (g.priority ?? 100) + delta),
        active: g.active ?? true,
      });
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  const deactivate = async (g: SkillGroupView) => {
    if (!confirm(`确认停用「${g.name ?? g.code}」?(软删,历史会话引用仍可解析)`)) return;
    try {
      await deactivateSkillGroup(g.id);
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  return (
    <section style={{ padding: 24, height: "100%", overflow: "auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>技能组</h2>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          共 {rows.length} 个{loading ? "  · 加载中" : ""}
        </span>
        <Capsule size="sm" variant="ghost" onClick={refresh}>
          刷新
        </Capsule>
        <Capsule size="sm" variant="primary" onClick={() => setEditing("new")}>
          + 新建
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
              <Th>code</Th>
              <Th>名称</Th>
              <Th>父技能</Th>
              <Th>优先级</Th>
              <Th>SLA(秒)</Th>
              <Th>状态</Th>
              <Th align="right">操作</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                <Td mono>{g.id}</Td>
                <Td mono>{g.code}</Td>
                <Td>{g.name ?? "—"}</Td>
                <Td mono>{g.parentCode ?? "—"}</Td>
                <Td mono>{g.priority ?? 100}</Td>
                <Td mono>{g.slaSeconds ?? 180}</Td>
                <Td>
                  {g.active === false ? (
                    <span style={{ color: "var(--color-danger, #d33)" }}>已停用</span>
                  ) : (
                    <span style={{ color: "var(--color-success, #34c759)" }}>启用</span>
                  )}
                </Td>
                <Td align="right">
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    <Capsule
                      size="sm"
                      variant="ghost"
                      onClick={() => bumpPriority(g, -10)}
                      title="优先级 -10(更优先)"
                    >
                      ↑
                    </Capsule>
                    <Capsule
                      size="sm"
                      variant="ghost"
                      onClick={() => bumpPriority(g, 10)}
                      title="优先级 +10(降级)"
                    >
                      ↓
                    </Capsule>
                    <Capsule size="sm" variant="ghost" onClick={() => setEditing(g)}>
                      编辑
                    </Capsule>
                    {g.active !== false ? (
                      <Capsule size="sm" variant="ghost" onClick={() => deactivate(g)}>
                        停用
                      </Capsule>
                    ) : null}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      {editing ? (
        <EditDialog
          group={editing === "new" ? null : editing}
          allGroups={rows}
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
  group,
  allGroups,
  onClose,
  onSaved,
}: {
  group: SkillGroupView | null;
  allGroups: SkillGroupView[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = group == null;
  const [code, setCode] = useState(group?.code ?? "");
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [parentCode, setParentCode] = useState(group?.parentCode ?? "");
  const [priority, setPriority] = useState(String(group?.priority ?? 100));
  const [slaSeconds, setSlaSeconds] = useState(String(group?.slaSeconds ?? 180));
  const [active, setActive] = useState(group?.active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        code,
        name,
        description,
        parentCode: parentCode || undefined,
        priority: Number(priority) || 100,
        slaSeconds: Number(slaSeconds) || 180,
        active,
      };
      if (isNew) {
        await createSkillGroup(body as SkillGroupView);
      } else {
        await updateSkillGroup(group!.id, body);
      }
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
        <h3 style={{ margin: 0, fontSize: 14 }}>
          {isNew ? "新建技能组" : `编辑 — ${group!.code}`}
        </h3>
        <Field label="code(锁定不可改;限英文小写 / 数字 / 下划线)">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            disabled={!isNew}
            style={inputStyle}
          />
        </Field>
        <Field label="名称">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="描述">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>
        <Field label="父技能 code(空 = 根;链上溢使用)">
          <select
            value={parentCode}
            onChange={(e) => setParentCode(e.target.value)}
            style={inputStyle}
          >
            <option value="">(无父级)</option>
            {allGroups
              .filter((g) => g.code !== code)
              .map((g) => (
                <option key={g.code} value={g.code}>
                  {g.code} · {g.name}
                </option>
              ))}
          </select>
        </Field>
        <div style={{ display: "flex", gap: 8 }}>
          <Field label="优先级(小=优先)">
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="SLA(秒)">
            <input
              type="number"
              value={slaSeconds}
              onChange={(e) => setSlaSeconds(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          启用
        </label>
        {err ? (
          <span style={{ color: "var(--color-danger, #d33)", fontSize: 12 }}>{err}</span>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <Capsule size="sm" variant="ghost" onClick={onClose}>
            取消
          </Capsule>
          <Capsule size="sm" variant="primary" onClick={submit} disabled={busy || !code || !name}>
            {busy ? "保存中…" : "保存"}
          </Capsule>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
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
  width: "100%",
};
