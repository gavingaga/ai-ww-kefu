import { useEffect, useMemo, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";

import { listPrompts, previewPrompt } from "../api/client.js";
import type { PromptPreview, PromptTemplate } from "../api/types.js";

const SAMPLE = {
  profile: { level: "VIP3" },
  live_context: { scene: "live_room", room_id: 8001, play: { quality: "720p" } },
  summary: "用户反馈直播卡顿,要求转技术支持",
  rag_chunks: "[卡顿排查] 切到 480p、切换 Wi-Fi、退出直播间重新进入。",
};

/** Prompt A/B — 列出全部 (scene, version),并排预览左/右两版的渲染结果。 */
export function PromptsPanel() {
  const [tmpls, setTmpls] = useState<PromptTemplate[]>([]);
  const [scene, setScene] = useState("default");
  const [verA, setVerA] = useState<number | null>(null);
  const [verB, setVerB] = useState<number | null>(null);
  const [renderA, setRenderA] = useState<PromptPreview | null>(null);
  const [renderB, setRenderB] = useState<PromptPreview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listPrompts()
      .then((t) => {
        setTmpls(t);
      })
      .catch((e: unknown) => setErr((e as Error).message));
  }, []);

  const scenes = useMemo(() => {
    const s = new Set(tmpls.map((t) => t.scene));
    return Array.from(s).sort();
  }, [tmpls]);

  const versions = useMemo(
    () => tmpls.filter((t) => t.scene === scene).sort((a, b) => a.version - b.version),
    [tmpls, scene],
  );

  // 默认 A=最低版本,B=最高版本(若有 ≥2 个)
  useEffect(() => {
    if (versions.length === 0) {
      setVerA(null);
      setVerB(null);
      return;
    }
    setVerA(versions[0]!.version);
    setVerB(versions[versions.length - 1]!.version);
  }, [versions]);

  const run = async () => {
    setErr(null);
    try {
      const tasks: Promise<PromptPreview>[] = [];
      if (verA != null) tasks.push(previewPrompt({ scene, version: verA, ...SAMPLE }));
      if (verB != null && verB !== verA)
        tasks.push(previewPrompt({ scene, version: verB, ...SAMPLE }));
      const out = await Promise.all(tasks);
      setRenderA(out[0] ?? null);
      setRenderB(out[1] ?? null);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  useEffect(() => {
    if (verA != null) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, verA, verB]);

  return (
    <div className="admin-layout">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "0 4px" }}>
        <strong style={{ fontSize: 18 }}>Prompt 模板 A/B</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
          /v1/admin/prompts · /v1/admin/prompts/preview → ai-hub
        </span>
        {err ? <span style={{ color: "#d33", fontSize: 12 }}>{err}</span> : null}
      </header>

      <GlassCard radius={12} className="admin-card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>scene:</span>
          {scenes.map((s) => (
            <Capsule key={s} size="sm" variant={s === scene ? "primary" : "ghost"} onClick={() => setScene(s)}>
              {s}
            </Capsule>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>version A:</span>
          {versions.map((v) => (
            <Capsule key={"a" + v.version} size="sm" variant={v.version === verA ? "primary" : "ghost"} onClick={() => setVerA(v.version)}>
              v{v.version}
            </Capsule>
          ))}
          <span style={{ marginLeft: 16, fontSize: 12, color: "var(--color-text-tertiary)" }}>version B:</span>
          {versions.map((v) => (
            <Capsule key={"b" + v.version} size="sm" variant={v.version === verB ? "primary" : "ghost"} onClick={() => setVerB(v.version)}>
              v{v.version}
            </Capsule>
          ))}
          <Capsule size="sm" variant="outline" onClick={() => void run()} style={{ marginLeft: "auto" }}>
            刷新
          </Capsule>
        </div>
      </GlassCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        <PreviewCard label="A" data={renderA} />
        <PreviewCard label="B" data={renderB} />
      </div>
    </div>
  );
}

function PreviewCard({ label, data }: { label: string; data: PromptPreview | null }) {
  return (
    <GlassCard radius={12} className="admin-card" style={{ overflow: "auto" }}>
      <strong style={{ fontSize: 13 }}>
        {label} {data ? `· ${data.scene} v${data.version}` : ""}
      </strong>
      {data ? (
        <>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            {data.title} · {data.source}
          </div>
          <pre
            style={{
              marginTop: 8,
              padding: "10px 12px",
              background: "var(--color-surface-alt)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-mono, monospace)",
              whiteSpace: "pre-wrap",
              maxHeight: "calc(100vh - 320px)",
              overflow: "auto",
            }}
          >
            {data.rendered}
          </pre>
        </>
      ) : (
        <p style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>无</p>
      )}
    </GlassCard>
  );
}
