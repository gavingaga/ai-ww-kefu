import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import {
  deleteAnnouncement,
  deleteQuickReply,
  listAnnouncements,
  listQuickReplies,
  saveAnnouncement,
  saveQuickReply,
} from "../api/client.js";
import type { AnnouncementRow, QuickReplyRow } from "../api/types.js";

/** 公告 + 快捷按钮 CRUD,落 notify-svc(透传 agent-bff /v1/admin/*)。 */
export function NoticesPanel() {
  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>公告 / 快捷按钮</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          /v1/admin/announcements · /v1/admin/quick-replies
        </span>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        <Announcements />
        <QuickReplies />
      </div>
    </div>
  );
}

function Announcements() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnnouncementRow>({
    level: "info",
    content: "",
    active: true,
  });

  const refresh = () =>
    listAnnouncements()
      .then(setRows)
      .catch((e: unknown) => setErr((e as Error).message));

  useEffect(() => {
    refresh();
  }, []);

  const onSave = async () => {
    if (!draft.content.trim()) return;
    try {
      await saveAnnouncement(draft);
      setDraft({ level: "info", content: "", active: true });
      refresh();
    } catch (e: unknown) {
      setErr((e as Error).message);
    }
  };

  const onDel = async (id: string) => {
    await deleteAnnouncement(id);
    refresh();
  };

  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>公告({rows.length})</strong>
      {err ? <div style={{ color: "#d33", fontSize: 12 }}>{err}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 6, marginTop: 8 }}>
        <select
          value={draft.level}
          onChange={(e) => setDraft({ ...draft, level: e.target.value as AnnouncementRow["level"] })}
          style={inputStyle}
        >
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="critical">critical</option>
        </select>
        <input
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          placeholder="公告内容"
          style={inputStyle}
        />
        <label style={{ alignSelf: "center", fontSize: 12, display: "flex", gap: 4 }}>
          <input
            type="checkbox"
            checked={draft.active ?? true}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          上线
        </label>
        <Capsule size="sm" variant="primary" onClick={onSave} disabled={!draft.content.trim()}>
          新增
        </Capsule>
      </div>
      <table className="admin-table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>级别</th>
            <th>内容</th>
            <th>上线</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 16 }}>
                暂无公告
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 999, background: levelBg(r.level) }}>
                    {r.level}
                  </span>
                </td>
                <td style={{ color: "var(--color-text-secondary)" }}>{r.content}</td>
                <td>{r.active ? "✓" : "—"}</td>
                <td>
                  <Capsule size="sm" variant="ghost" onClick={() => r.id && onDel(r.id)}>
                    删除
                  </Capsule>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </GlassCard>
  );
}

function QuickReplies() {
  const [rows, setRows] = useState<QuickReplyRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuickReplyRow>({
    label: "",
    payload: "",
    scene: "general",
    icon: "",
    active: true,
  });

  const refresh = () =>
    listQuickReplies()
      .then(setRows)
      .catch((e: unknown) => setErr((e as Error).message));

  useEffect(() => {
    refresh();
  }, []);

  const onSave = async () => {
    if (!draft.label.trim() || !draft.payload.trim()) return;
    try {
      await saveQuickReply(draft);
      setDraft({ label: "", payload: "", scene: "general", icon: "", active: true });
      refresh();
    } catch (e: unknown) {
      setErr((e as Error).message);
    }
  };

  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>快捷按钮({rows.length})</strong>
      {err ? <div style={{ color: "#d33", fontSize: 12 }}>{err}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr auto auto", gap: 6, marginTop: 8 }}>
        <input
          value={draft.icon ?? ""}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
          placeholder="🎬"
          style={{ ...inputStyle, width: 50 }}
        />
        <input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="按钮文案"
          style={inputStyle}
        />
        <input
          value={draft.payload}
          onChange={(e) => setDraft({ ...draft, payload: e.target.value })}
          placeholder="点击后发送的消息"
          style={inputStyle}
        />
        <input
          value={draft.scene ?? ""}
          onChange={(e) => setDraft({ ...draft, scene: e.target.value })}
          placeholder="scene"
          style={{ ...inputStyle, width: 90 }}
        />
        <Capsule size="sm" variant="primary" onClick={onSave} disabled={!draft.label.trim() || !draft.payload.trim()}>
          新增
        </Capsule>
      </div>
      <table className="admin-table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>icon</th>
            <th>label</th>
            <th>payload</th>
            <th>scene</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 16 }}>
                暂无
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>{r.icon ?? "—"}</td>
                <td>{r.label}</td>
                <td style={{ color: "var(--color-text-secondary)" }}>{r.payload}</td>
                <td>{r.scene ?? "—"}</td>
                <td>
                  <Capsule size="sm" variant="ghost" onClick={() => r.id && deleteQuickReply(r.id).then(refresh)}>
                    删除
                  </Capsule>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </GlassCard>
  );
}

function levelBg(level: string): string {
  if (level === "critical") return "color-mix(in srgb, #f33 14%, var(--color-surface-alt))";
  if (level === "warning") return "color-mix(in srgb, #fc0 14%, var(--color-surface-alt))";
  return "var(--color-surface-alt)";
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
