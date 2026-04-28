import { useEffect, useMemo, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { faqPreview, faqSaveTree, faqTrees } from "../api/client.js";
import type { FaqNode, FaqPreviewResult, FaqTree } from "../api/types.js";

/**
 * FAQ 树管理 — 列出所有 scene 的树,展开节点,可编辑当前节点的 title /
 * synonyms / answer.contentMd,JSON 整体提交到 PUT /admin/v1/faq/trees。
 *
 * 还提供一个 query 模拟器,便于运营在保存后立刻验证命中。
 */
export function FaqPanel() {
  const [trees, setTrees] = useState<FaqTree[]>([]);
  const [scene, setScene] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewQ, setPreviewQ] = useState("");
  const [preview, setPreview] = useState<FaqPreviewResult | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await faqTrees();
      setTrees(data);
      if (!scene && data.length) setScene(data[0]?.scene ?? "");
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tree = useMemo(() => trees.find((t) => t.scene === scene), [trees, scene]);
  const flatNodes = useMemo(() => (tree ? flatten(tree.nodes) : []), [tree]);
  const selected = useMemo(
    () => flatNodes.find((n) => n.id === selectedId) ?? null,
    [flatNodes, selectedId],
  );

  const updateSelected = (patch: Partial<FaqNode>) => {
    if (!tree || !selected) return;
    const next: FaqTree = {
      ...tree,
      nodes: replaceNode(tree.nodes, selected.id, (n) => ({ ...n, ...patch })),
    };
    setTrees((prev) => prev.map((t) => (t.scene === tree.scene ? next : t)));
  };

  const save = async () => {
    if (!tree) return;
    setSaving(true);
    setErr(null);
    try {
      const saved = await faqSaveTree(tree);
      setTrees((prev) => prev.map((t) => (t.scene === saved.scene ? saved : t)));
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    if (!previewQ.trim()) return;
    try {
      setPreview(await faqPreview(previewQ.trim()));
    } catch (e: unknown) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>FAQ 节点管理</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          PUT /v1/admin/faq/trees(scene 维度整树覆盖) · POST /v1/admin/faq/preview
        </span>
        <Capsule size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? "拉取中…" : "刷新"}
        </Capsule>
        <Capsule
          size="sm"
          variant="primary"
          onClick={() => void save()}
          disabled={saving || !tree}
        >
          {saving ? "保存中…" : "保存当前 scene"}
        </Capsule>
        {err ? (
          <span style={{ marginLeft: "auto", color: "#d33", fontSize: 12 }}>错误:{err}</span>
        ) : null}
      </header>

      <GlassCard strength="base" radius={12} className="admin-card">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>scene:</span>
          {trees.map((t) => (
            <Capsule
              key={t.scene}
              size="sm"
              variant={t.scene === scene ? "primary" : "ghost"}
              onClick={() => {
                setScene(t.scene);
                setSelectedId(null);
              }}
            >
              {t.scene} · {countLeaves(t.nodes)} 叶
            </Capsule>
          ))}
        </div>
      </GlassCard>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        <GlassCard strength="base" radius={12} className="admin-card" style={{ overflow: "auto" }}>
          <strong style={{ fontSize: 13 }}>节点(共 {flatNodes.length})</strong>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
            {tree?.nodes.map((n) => (
              <NodeItem
                key={n.id}
                node={n}
                depth={0}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </ul>
        </GlassCard>

        <GlassCard strength="base" radius={12} className="admin-card" style={{ overflow: "auto" }}>
          {selected ? (
            <NodeEditor node={selected} onPatch={updateSelected} />
          ) : (
            <p style={{ color: "var(--color-text-tertiary)" }}>从左侧选择一个节点开始编辑</p>
          )}

          <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--color-border)" }} />
          <strong style={{ fontSize: 13 }}>命中模拟器</strong>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              value={previewQ}
              onChange={(e) => setPreviewQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void runPreview();
              }}
              placeholder="试试:看视频卡顿怎么办"
              style={inputStyle}
            />
            <Capsule size="sm" variant="primary" onClick={() => void runPreview()}>
              匹配
            </Capsule>
          </div>
          {preview ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
              {preview.hit ? (
                <>
                  ✅ 命中 <strong>{preview.title}</strong>(node_id={preview.node_id} · how=
                  {preview.how} · score={preview.score?.toFixed(2)} · 累计命中=
                  {preview.hits ?? 0})
                </>
              ) : (
                <>❌ 未命中(走 LLM / RAG 兜底)</>
              )}
            </div>
          ) : null}
        </GlassCard>
      </div>
    </div>
  );
}

function NodeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: FaqNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isSelected = node.id === selectedId;
  return (
    <li>
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "4px 6px",
          paddingLeft: 6 + depth * 12,
          borderRadius: 6,
          cursor: "pointer",
          background: isSelected ? "var(--color-surface-alt)" : "transparent",
        }}
        onClick={() => onSelect(node.id)}
      >
        {node.children && node.children.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
              padding: 0,
              width: 14,
              fontSize: 11,
            }}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span style={{ width: 14 }} />
        )}
        <span style={{ flex: 1, fontSize: 12 }}>
          {node.icon ? `${node.icon} ` : ""}
          {node.title || <em style={{ color: "var(--color-text-tertiary)" }}>(无标题)</em>}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {node.isLeaf ? "leaf" : `${node.children?.length ?? 0} 子`}
        </span>
      </div>
      {open && node.children?.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {node.children.map((c) => (
            <NodeItem
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function NodeEditor({ node, onPatch }: { node: FaqNode; onPatch: (p: Partial<FaqNode>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong style={{ fontSize: 13 }}>编辑节点 — {node.id}</strong>
      <Field label="title">
        <input value={node.title ?? ""} onChange={(e) => onPatch({ title: e.target.value })} style={inputStyle} />
      </Field>
      <Field label="icon">
        <input
          value={node.icon ?? ""}
          onChange={(e) => onPatch({ icon: e.target.value })}
          placeholder="🎬"
          style={inputStyle}
        />
      </Field>
      <Field label="isLeaf">
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={!!node.isLeaf}
            onChange={(e) => onPatch({ isLeaf: e.target.checked })}
          />{" "}
          叶子节点(必须有 answer)
        </label>
      </Field>
      <Field label="synonyms">
        <textarea
          value={(node.synonyms ?? []).join("\n")}
          onChange={(e) =>
            onPatch({
              synonyms: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="一行一条同义问"
          rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono, monospace)" }}
        />
      </Field>
      <Field label="answer.contentMd">
        <textarea
          value={node.answer?.contentMd ?? ""}
          onChange={(e) =>
            onPatch({
              answer: {
                ...(node.answer ?? {}),
                contentMd: e.target.value,
              },
            })
          }
          rows={6}
          placeholder="支持 Markdown,会被 ai-hub /faq/match 直接返回给前端"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono, monospace)" }}
        />
      </Field>
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

function flatten(nodes: FaqNode[]): FaqNode[] {
  const out: FaqNode[] = [];
  const walk = (ns: FaqNode[]) => {
    for (const n of ns) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function countLeaves(nodes: FaqNode[]): number {
  let n = 0;
  for (const x of flatten(nodes)) if (x.isLeaf) n++;
  return n;
}

function replaceNode(
  nodes: FaqNode[],
  id: string,
  fn: (n: FaqNode) => FaqNode,
): FaqNode[] {
  return nodes.map((n) => {
    if (n.id === id) return fn(n);
    if (n.children?.length) return { ...n, children: replaceNode(n.children, id, fn) };
    return n;
  });
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
