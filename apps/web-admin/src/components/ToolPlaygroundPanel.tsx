import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { invokeTool, listTools } from "../api/client.js";
import type { ToolDef, ToolInvokeResult } from "../api/types.js";

/**
 * 工具调试器 — 列表所有 tool-svc 工具,挑一个,编辑 args/ctx JSON,跑一次,看结果。
 *
 * 写工具默认 dry_run=true(后端 tool-svc 自动短路);取消勾选 dry_run 才真执行。
 */
export function ToolPlaygroundPanel() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [name, setName] = useState<string>("");
  const [argsRaw, setArgsRaw] = useState("{}");
  const [ctxRaw, setCtxRaw] = useState('{"session_id":"ses_dbg","dry_run":true}');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ToolInvokeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listTools()
      .then((t) => {
        setTools(t);
        if (t.length > 0 && !name) {
          setName(t[0]!.name);
        }
      })
      .catch((e: unknown) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tool = tools.find((t) => t.name === name);

  // 切工具时,把 args 占位填成 schema 默认空对象
  useEffect(() => {
    if (!tool) return;
    const props = (tool.parameters as { properties?: Record<string, unknown> } | undefined)?.properties;
    if (props && Object.keys(props).length > 0) {
      const sample: Record<string, unknown> = {};
      for (const k of Object.keys(props)) sample[k] = "";
      setArgsRaw(JSON.stringify(sample, null, 2));
    } else {
      setArgsRaw("{}");
    }
  }, [tool]);

  const run = async () => {
    if (!name) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const args = argsRaw.trim() ? (JSON.parse(argsRaw) as Record<string, unknown>) : {};
      const ctx = ctxRaw.trim() ? (JSON.parse(ctxRaw) as Record<string, unknown>) : {};
      const r = await invokeTool(name, { args, ctx });
      setResult(r);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>工具调试器</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          POST /v1/admin/tools/{`{name}`}/invoke → tool-svc · 写工具默认 dry_run=true
        </span>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
          <strong style={{ fontSize: 13 }}>工具({tools.length})</strong>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {tools.map((t) => (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => setName(t.name)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "1px solid",
                    borderColor: name === t.name ? "var(--color-primary, #0A84FF)" : "transparent",
                    background: name === t.name ? "var(--color-surface-alt)" : "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    {t.name}
                    {t.write ? (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "color-mix(in srgb, var(--color-warning) 20%, var(--color-surface-alt))" }}>
                        WRITE
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{t.description?.slice(0, 60)}</div>
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard radius={12} className="admin-card" style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {tool ? (
            <>
              <div>
                <strong style={{ fontSize: 14 }}>{tool.name}</strong>
                <span style={{ marginLeft: 8, color: "var(--color-text-tertiary)", fontSize: 12 }}>
                  超时 {tool.timeout_ms || "默认"}ms · {tool.write ? "写操作(默认 dry_run)" : "读操作"}
                </span>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{tool.description}</div>
              </div>

              <Field label="parameters schema (来自 tool-svc)">
                <pre
                  style={{
                    margin: 0,
                    padding: "8px 10px",
                    background: "var(--color-surface-alt)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "var(--font-mono, monospace)",
                    maxHeight: 160,
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(tool.parameters ?? {}, null, 2)}
                </pre>
              </Field>

              <Field label="args (JSON)">
                <textarea
                  value={argsRaw}
                  onChange={(e) => setArgsRaw(e.target.value)}
                  rows={6}
                  style={textareaStyle}
                />
              </Field>

              <Field label="ctx (JSON; 写工具记得 dry_run:false 才真执行)">
                <textarea
                  value={ctxRaw}
                  onChange={(e) => setCtxRaw(e.target.value)}
                  rows={3}
                  style={textareaStyle}
                />
              </Field>

              <div style={{ display: "flex", gap: 6 }}>
                <Capsule size="md" variant="primary" onClick={() => void run()} disabled={busy}>
                  {busy ? "执行中…" : "执行"}
                </Capsule>
                {err ? <span style={{ color: "#d33", fontSize: 12, alignSelf: "center" }}>{err}</span> : null}
              </div>

              {result ? (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    background: result.ok
                      ? "color-mix(in srgb, var(--color-success, #0a7) 8%, var(--color-surface))"
                      : "color-mix(in srgb, #d33 10%, var(--color-surface))",
                  }}
                >
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    {result.ok ? "✓ ok" : "✗ failed"} · 耗时 {result.duration_ms ?? 0}ms · audit_id{" "}
                    <code style={{ fontSize: 11 }}>{result.audit_id ?? "-"}</code>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: "8px 10px",
                      background: "var(--color-surface-alt)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: "var(--font-mono, monospace)",
                      maxHeight: 280,
                      overflow: "auto",
                    }}
                  >
                    {JSON.stringify(result.ok ? result.result : { error: result.error }, null, 2)}
                  </pre>
                </div>
              ) : null}
            </>
          ) : (
            <span style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}>从左侧选一个工具开始</span>
          )}
        </GlassCard>
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

const textareaStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "var(--color-surface-alt)",
  font: "inherit",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 12,
  color: "var(--color-text-primary)",
  outline: "none",
  resize: "vertical",
};
