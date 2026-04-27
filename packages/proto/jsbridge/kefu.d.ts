/**
 * JSBridge 协议 — 客服 H5 ↔ 宿主 App。
 * 命名空间 `kefu.*`。所有方法返回 Promise(Native 异步实现)。
 *
 * 详见 PRD 02-C端-WebH5-需求.md §6 与 04-契约优先工作流.md §5。
 */

export type ThemeMode = "light" | "dark" | "auto";
export type Orientation = "portrait" | "landscape";
export type HapticType = "light" | "medium" | "heavy" | "success" | "warning" | "error";

/**
 * LiveContext 上报字段(与 live-context.schema.json v1 一一对应)。
 * 此处仅给 TS 视角的类型,运行时校验由 schema 完成。
 */
export interface LiveContext {
  version?: "v1";
  scene: "live_room" | "vod_detail" | "home" | "settings" | "anchor_console" | "report_flow";
  room_id?: number | null;
  anchor_id?: number | null;
  vod_id?: number | null;
  program_title?: string | null;
  play?: {
    state?: "playing" | "buffering" | "paused" | "error" | "idle";
    quality?: "auto" | "240p" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "4k";
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

/** 播放器最近 60 秒诊断信息(由 H5 -> 宿主请求获取) */
export interface PlayDiagnosticsClient {
  collected_at: number;
  qualities_available: string[];
  log_ring: Array<{
    ts: number;
    type: "buffer_start" | "buffer_end" | "error" | "quality_switch" | "first_frame" | "play" | "pause";
    detail?: Record<string, unknown>;
  }>;
}

/** Native -> JS 事件订阅器 */
export type Unsubscribe = () => void;

/**
 * 客服 H5 与宿主 App 之间的 JSBridge。
 * 所有方法在不可用时(浏览器外或宿主未注入)抛 `BridgeUnavailable`。
 */
export interface KefuBridge {
  /** 协议握手 — H5 启动时调用,宿主返回支持的版本与能力。 */
  ready(opts?: { minVer?: string }): Promise<{
    bridge_ver: string;
    host_app_ver: string;
    capabilities: string[];
  }>;

  /** 注入用户态(免登录) */
  setUserToken(token: string): Promise<void>;

  /** 推送 / 更新直播上下文 */
  setLiveContext(ctx: LiveContext): Promise<void>;

  /** 让宿主返回播放器最近 60s 日志 */
  requestPlayDiagnostics(): Promise<PlayDiagnosticsClient>;

  /** 切换清晰度(用户已确认后由 AI/坐席请求) */
  switchQuality(level: NonNullable<LiveContext["play"]>["quality"]): Promise<void>;

  /** 重新进入直播间(故障恢复) */
  reenterRoom(roomId: number): Promise<void>;

  /** 触感反馈 */
  haptic(type: HapticType): Promise<void>;

  /** 由宿主处理外部链接 */
  openLink(url: string): Promise<void>;

  /** 最小化为悬浮气泡(不结束会话) */
  minimize(): Promise<void>;

  /** 关闭客服窗口 */
  close(): Promise<void>;

  /** 订阅 Native -> JS 事件 */
  on(event: "themeChange", cb: (theme: ThemeMode) => void): Unsubscribe;
  on(event: "orientation", cb: (o: Orientation) => void): Unsubscribe;
  on(event: "pipChange", cb: (active: boolean) => void): Unsubscribe;
  on(event: "liveContextChange", cb: (ctx: LiveContext) => void): Unsubscribe;
}

declare global {
  interface Window {
    /** 客服 SDK 启动后注入 */
    kefu?: KefuBridge;
  }
}

export {};
