import { useEffect, useState } from "react";

import { Capsule, GlassCard } from "@ai-kefu/ui-glass";
import { getKefuBridge, type LiveContext, type PlayDiagnostics, type Quality } from "@ai-kefu/sdk-jsbridge";

const QUALITIES: Quality[] = ["480p", "720p", "1080p"];

/**
 * 直播间快照 + 播放诊断 — 入口在 ConnectionBar 下方,常驻折叠条。
 */
export function RoomSnapshotCard() {
  const sdk = getKefuBridge();
  const [ctx, setCtx] = useState<LiveContext | null>(null);
  const [diag, setDiag] = useState<PlayDiagnostics | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  useEffect(() => {
    // 纯 web 兜底:从 livectx-svc GET 拉拼合后的 LiveContext;真实宿主里
    // 由原生在 setLiveContext 后,这里通过 SDK 的内部状态拿到。
    const url = new URL(window.location.href);
    const scene = (url.searchParams.get("scene") || "live_room") as LiveContext["scene"];
    const roomId = Number(url.searchParams.get("room_id") || "8001");
    fetch(`/v1/live/context?scene=${scene}&room_id=${roomId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCtx({ scene, room_id: roomId, ...d }))
      .catch(() => {});
  }, []);

  if (!ctx) return null;
  const play = ctx.play ?? {};
  const network = ctx.network ?? {};

  const runDiag = async () => {
    if (!ctx.room_id && !ctx.vod_id) return;
    setDiagBusy(true);
    setDiag(null);
    try {
      const d = await sdk.requestPlayDiagnostics({
        room_id: ctx.room_id ?? undefined,
        vod_id: ctx.vod_id ?? undefined,
      });
      setDiag(d);
    } finally {
      setDiagBusy(false);
    }
  };

  return (
    <GlassCard
      strength="weak"
      radius={12}
      style={{
        margin: "8px 12px 0",
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12, alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>📺 直播间</span>
        <Tag k="房间" v={ctx.room_id ?? ctx.vod_id ?? "—"} />
        {ctx.program_title ? <Tag k="节目" v={ctx.program_title} /> : null}
        {play.quality ? <Tag k="清晰度" v={String(play.quality)} /> : null}
        {typeof play.buffer_events_60s === "number" ? (
          <Tag k="卡顿/分" v={String(play.buffer_events_60s)} tone={play.buffer_events_60s >= 3 ? "warn" : undefined} />
        ) : null}
        {network.type ? <Tag k="网络" v={String(network.type)} /> : null}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <Capsule size="sm" variant="ghost" onClick={() => void runDiag()} disabled={diagBusy}>
            {diagBusy ? "诊断中…" : "播放诊断"}
          </Capsule>
        </span>
      </div>
      {diag ? (
        <div
          style={{
            padding: "6px 8px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: toneBg(diag.verdict),
            fontSize: 12,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div>
            <strong>{verdictLabel(diag.verdict)}</strong> · {diag.summary}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {QUALITIES.map((q) => (
              <Capsule key={q} size="sm" variant="outline" onClick={() => sdk.switchQuality(q)}>
                切到 {q}
              </Capsule>
            ))}
            <Capsule size="sm" variant="outline" onClick={() => sdk.reenterRoom(ctx.room_id ?? undefined)}>
              重进直播间
            </Capsule>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}

function Tag({ k, v, tone }: { k: string; v: string | number; tone?: "warn" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        background:
          tone === "warn"
            ? "color-mix(in srgb, var(--color-warning) 18%, var(--color-surface-alt))"
            : "var(--color-surface-alt)",
        fontSize: 11,
      }}
    >
      <span style={{ color: "var(--color-text-tertiary)" }}>{k}</span>
      <strong>{String(v)}</strong>
    </span>
  );
}

function verdictLabel(v: PlayDiagnostics["verdict"]): string {
  return (
    {
      local_network: "🌐 本地网络偏弱",
      cdn: "📡 CDN/源站异常",
      origin: "📡 源站异常",
      auth: "🔐 鉴权异常",
      app_bug: "🐞 客户端异常",
      unknown: "❓ 未发现明显问题",
    } as const
  )[v];
}

function toneBg(v: PlayDiagnostics["verdict"]): string {
  if (v === "local_network" || v === "auth")
    return "color-mix(in srgb, var(--color-warning) 12%, var(--color-surface))";
  if (v === "cdn" || v === "origin" || v === "app_bug")
    return "color-mix(in srgb, var(--color-danger) 12%, var(--color-surface))";
  return "var(--color-surface)";
}
