import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import {
  llmCreateProfile,
  llmDeleteProfile,
  llmListProfiles,
  llmProfileQuota,
  llmTestProfile,
  llmUpdateProfile,
} from "../api/client.js";
import type { LlmProfile, LlmQuotaSnapshot } from "../api/types.js";

const EMPTY: LlmProfile = {
  id: "",
  provider: "openai",
  base_url: "https://api.openai.com/v1",
  api_key: "",
  model: "gpt-4o-mini",
  params: { temperature: 0.3, max_tokens: 800 },
  timeout_ms: 15000,
  rpm: 600,
  tpm: 200000,
  budget_usd_daily: 0,
  rate_in_per_1k: 0,
  rate_out_per_1k: 0,
  fallback_id: null,
  tags: ["default"],
};

/** 模型档位 CRUD + 测试连接 + 配额快照。api_key 不回显;留空表示保留旧值。 */
export function LlmProfilesPanel() {
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [edit, setEdit] = useState<LlmProfile | null>(null);
  const [quota, setQuota] = useState<Record<string, LlmQuotaSnapshot>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setErr(null);
    try {
      const list = await llmListProfiles();
      setProfiles(list);
      // 并发拉每个档位的 quota
      const q: Record<string, LlmQuotaSnapshot> = {};
      await Promise.all(
        list.map((p) =>
          llmProfileQuota(p.id)
            .then((s) => {
              q[p.id] = s;
            })
            .catch(() => {}),
        ),
      );
      setQuota(q);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onTest = async (id: string) => {
    setBusyId(id);
    try {
      const r = await llmTestProfile(id, "你好,请用一句话自我介绍。");
      if (r.ok) alert(`✓ ${id} 通畅\n\n${r.sample ?? ""}`);
      else alert(`✗ ${id} 失败\n\n${r.error ?? ""}`);
    } finally {
      setBusyId(null);
    }
  };

  const onDel = async (id: string) => {
    if (id === "openai_default") {
      alert("openai_default 是兜底档位,不能删除");
      return;
    }
    if (!confirm(`删除档位 ${id}?`)) return;
    setBusyId(id);
    try {
      await llmDeleteProfile(id);
      await refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  };

  const onSave = async (p: LlmProfile, isNew: boolean) => {
    setBusyId(p.id || "_new");
    setErr(null);
    try {
      if (isNew) await llmCreateProfile(p);
      else await llmUpdateProfile(p);
      setEdit(null);
      await refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>LLM 模型档位</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          /v1/admin/llm-profiles → llm-router · 管理后台不回显 api_key
        </span>
        <Capsule size="sm" variant="primary" onClick={() => setEdit({ ...EMPTY })} style={{ marginLeft: "auto" }}>
          + 新增档位
        </Capsule>
      </header>

      {err ? <div style={{ color: "#d33", fontSize: 12 }}>{err}</div> : null}

      <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>id</th>
              <th>provider</th>
              <th>model</th>
              <th>base_url</th>
              <th className="num">RPM</th>
              <th className="num">TPM</th>
              <th>预算 / 当日</th>
              <th>fallback</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: 16 }}>
                  暂无档位
                </td>
              </tr>
            ) : (
              profiles.map((p) => {
                const q = quota[p.id];
                const used = q?.today_used_pct ?? 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.id}</strong>
                      {p.api_key_last4 ? (
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                          key …{p.api_key_last4}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#d33" }}>未配 key</div>
                      )}
                    </td>
                    <td>{p.provider}</td>
                    <td>{p.model}</td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "var(--color-text-secondary)" }}>
                      {p.base_url}
                    </td>
                    <td className="num">{p.rpm ?? 0}</td>
                    <td className="num">{p.tpm ?? 0}</td>
                    <td style={{ fontSize: 11 }}>
                      {p.budget_usd_daily ? (
                        <>
                          ${p.budget_usd_daily} ·{" "}
                          <span style={{ color: used >= 0.8 ? "#d33" : "var(--color-text-secondary)" }}>
                            {(used * 100).toFixed(0)}%
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{p.fallback_id ?? "—"}</td>
                    <td style={{ display: "flex", gap: 4 }}>
                      <Capsule size="sm" variant="ghost" onClick={() => void onTest(p.id)} disabled={busyId === p.id}>
                        试聊
                      </Capsule>
                      <Capsule size="sm" variant="ghost" onClick={() => setEdit({ ...p, api_key: "" })}>
                        编辑
                      </Capsule>
                      <Capsule size="sm" variant="outline" onClick={() => void onDel(p.id)} disabled={busyId === p.id}>
                        删除
                      </Capsule>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </GlassCard>

      {edit ? (
        <ProfileEditor
          value={edit}
          isNew={!profiles.some((p) => p.id === edit.id)}
          onCancel={() => setEdit(null)}
          onSave={onSave}
          busy={busyId === edit.id || busyId === "_new"}
        />
      ) : null}
    </div>
  );
}

function ProfileEditor({
  value,
  isNew,
  onCancel,
  onSave,
  busy,
}: {
  value: LlmProfile;
  isNew: boolean;
  onCancel: () => void;
  onSave: (p: LlmProfile, isNew: boolean) => void | Promise<void>;
  busy: boolean;
}) {
  const [v, setV] = useState<LlmProfile>(value);
  return (
    <GlassCard
      strength="base"
      radius={12}
      className="admin-card"
      style={{ position: "fixed", inset: "10vh 10vw", zIndex: 99, padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <strong style={{ fontSize: 16 }}>{isNew ? "新增档位" : "编辑 " + v.id}</strong>
      <Field label="id">
        <input value={v.id} onChange={(e) => setV({ ...v, id: e.target.value })} disabled={!isNew} style={inputStyle} />
      </Field>
      <Field label="provider">
        <select value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value })} style={inputStyle}>
          <option value="openai">openai</option>
          <option value="azure_openai">azure_openai</option>
          <option value="anthropic">anthropic</option>
          <option value="openai_compatible">openai_compatible</option>
        </select>
      </Field>
      <Field label="base_url">
        <input value={v.base_url ?? ""} onChange={(e) => setV({ ...v, base_url: e.target.value })} style={inputStyle} />
      </Field>
      <Field label={isNew ? "api_key" : "api_key(留空表示保留旧值)"}>
        <input
          type="password"
          value={v.api_key ?? ""}
          onChange={(e) => setV({ ...v, api_key: e.target.value })}
          placeholder={isNew ? "sk-..." : "保留旧 key"}
          style={inputStyle}
        />
      </Field>
      <Field label="model">
        <input value={v.model ?? ""} onChange={(e) => setV({ ...v, model: e.target.value })} style={inputStyle} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Field label="rpm">
          <input type="number" value={v.rpm ?? 0} onChange={(e) => setV({ ...v, rpm: Number(e.target.value) })} style={inputStyle} />
        </Field>
        <Field label="tpm">
          <input type="number" value={v.tpm ?? 0} onChange={(e) => setV({ ...v, tpm: Number(e.target.value) })} style={inputStyle} />
        </Field>
        <Field label="timeout_ms">
          <input type="number" value={v.timeout_ms ?? 0} onChange={(e) => setV({ ...v, timeout_ms: Number(e.target.value) })} style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Field label="budget_usd_daily">
          <input type="number" step="0.01" value={v.budget_usd_daily ?? 0} onChange={(e) => setV({ ...v, budget_usd_daily: Number(e.target.value) })} style={inputStyle} />
        </Field>
        <Field label="rate_in_per_1k (USD)">
          <input type="number" step="0.0001" value={v.rate_in_per_1k ?? 0} onChange={(e) => setV({ ...v, rate_in_per_1k: Number(e.target.value) })} style={inputStyle} />
        </Field>
        <Field label="rate_out_per_1k (USD)">
          <input type="number" step="0.0001" value={v.rate_out_per_1k ?? 0} onChange={(e) => setV({ ...v, rate_out_per_1k: Number(e.target.value) })} style={inputStyle} />
        </Field>
      </div>
      <Field label="fallback_id(失败时降级到哪个档位)">
        <input value={v.fallback_id ?? ""} onChange={(e) => setV({ ...v, fallback_id: e.target.value || null })} style={inputStyle} />
      </Field>
      <Field label="params (JSON)">
        <textarea
          value={JSON.stringify(v.params ?? {}, null, 2)}
          onChange={(e) => {
            try {
              setV({ ...v, params: JSON.parse(e.target.value) });
            } catch {
              // 暂不报错,保存时校验
            }
          }}
          rows={4}
          style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)", fontSize: 12, resize: "vertical" }}
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Capsule size="md" variant="primary" onClick={() => onSave(v, isNew)} disabled={busy || !v.id.trim()}>
          {busy ? "保存中…" : "保存"}
        </Capsule>
        <Capsule size="md" variant="ghost" onClick={onCancel}>
          取消
        </Capsule>
      </div>
    </GlassCard>
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
