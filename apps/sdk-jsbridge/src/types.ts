/** apps/sdk-jsbridge 类型定义 — 与 packages/proto/live-context schema 对齐。 */

export type Scene =
  | "live_room"
  | "vod_detail"
  | "home"
  | "settings"
  | "anchor_console"
  | "report_flow";

export type Quality = "auto" | "240p" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "4k";

export interface LiveContext {
  version?: "v1";
  scene: Scene;
  room_id?: number | null;
  anchor_id?: number | null;
  vod_id?: number | null;
  program_title?: string | null;
  play?: {
    state?: "playing" | "buffering" | "paused" | "error" | "idle";
    quality?: Quality;
    bitrate_kbps?: number;
    fps?: number;
    first_frame_ms?: number;
    buffer_events_60s?: number;
    buffer_total_ms_60s?: number;
    last_error_code?: string | null;
    cdn_node?: string | null;
    stream_url_hash?: string | null;
    drm?: boolean;
  };
  device?: {
    platform?: "iOS" | "Android" | "PC" | "Pad" | "TV";
    os?: string;
    app_ver?: string;
    model?: string;
  };
  network?: {
    type?: "wifi" | "4g" | "5g" | "ethernet" | "unknown";
    rtt_ms?: number;
    downlink_mbps?: number;
  };
  user?: {
    uid?: number | null;
    level?: string | null;
    is_anchor?: boolean;
    is_minor_guard?: boolean;
  };
  entry?: "bubble" | "drawer" | "fullscreen" | "menu" | "report_button" | "agent_console";
  report?: {
    type?: "porn" | "abuse" | "copyright" | "minor" | "other";
    evidence_clip_url?: string | null;
    ts_in_stream?: number | null;
  } | null;
}

export interface PlayDiagnostics {
  verdict: "local_network" | "cdn" | "origin" | "auth" | "app_bug" | "unknown";
  summary: string;
  snapshot?: Record<string, unknown>;
}

export type Orientation = "portrait" | "landscape";

/** 宿主原生注入入口。SDK 优先用,不存在则纯 web 兜底。 */
export interface NativeBridge {
  setLiveContext?: (ctx: LiveContext) => void | Promise<void>;
  requestPlayDiagnostics?: (
    keys: { room_id?: number; vod_id?: number },
  ) => Promise<PlayDiagnostics>;
  switchQuality?: (q: Quality) => void | Promise<void>;
  reenterRoom?: (room_id?: number) => void | Promise<void>;
  minimize?: () => void;
  openLink?: (url: string) => void;
  onOrientation?: (cb: (o: Orientation) => void) => void;
  onPipChange?: (cb: (inPip: boolean) => void) => void;
}

declare global {
  interface Window {
    kefu?: NativeBridge;
  }
}
