/**
 * 静态 mock 数据 — M0 应用骨架阶段使用,等 T-101/T-104/T-110 联调后由 API/WS 替换。
 */
import type { MarqueeItem } from "@ai-kefu/ui-glass";

export const announcements: MarqueeItem[] = [
  {
    id: 1,
    level: "critical",
    content: "直播间 8001 当前正在抢修,工程师已介入,预计 5 分钟内恢复",
  },
  {
    id: 2,
    level: "info",
    content: "新版客服上线:多级常见问题,叶子节点直达答案,无需排队",
  },
  {
    id: 3,
    level: "warning",
    content: "本周日 02:00-04:00 进行系统维护,期间客服仅保留 AI 应答",
  },
];

export interface QuickReply {
  id: number;
  label: string;
  payload: string;
  scene: string;
  icon?: string;
}

export const quickReplies: QuickReply[] = [
  { id: 1, label: "我看视频卡顿", payload: "我看视频卡顿,帮我看一下", scene: "play", icon: "📡" },
  { id: 2, label: "如何取消订阅", payload: "怎么取消连续包月?", scene: "membership", icon: "💳" },
  { id: 3, label: "弹幕异常", payload: "我的弹幕发不出来", scene: "im", icon: "💬" },
  { id: 4, label: "举报内容", payload: "我要举报这条内容", scene: "report", icon: "🚨" },
  { id: 5, label: "联系人工", payload: "转人工", scene: "handoff", icon: "👤" },
];

export interface FaqAction {
  type: "send_text" | "handoff" | "open_link" | "open_form";
  label: string;
  payload?: string;
}

export interface FaqAttachment {
  type: "image" | "file" | "link";
  url: string;
}

export interface FaqFollowUp {
  id: string;
  title: string;
}

export interface FaqAnswer {
  contentMd?: string;
  attachments?: FaqAttachment[];
  followUps?: FaqFollowUp[];
  actions?: FaqAction[];
}

export interface FaqMessageContent {
  nodeId: string;
  title: string;
  how?: "exact" | "similar";
  score?: number;
  answer: FaqAnswer;
}

export interface ToolCallContent {
  /** 工具名,如 get_play_diagnostics */
  name: string;
  args?: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
  /** 友好的人类可读名(由前端基于 name 翻译) */
  label?: string;
}

export type Message =
  | {
      kind: "text";
      id: string;
      role: "user" | "ai" | "agent" | "system";
      text: string;
      ts: number;
      thinking?: boolean;
    }
  | {
      kind: "faq";
      id: string;
      role: "ai";
      ts: number;
      faq: FaqMessageContent;
    }
  | {
      kind: "tool";
      id: string;
      role: "ai";
      ts: number;
      tool: ToolCallContent;
    };

export const initialMessages: Message[] = [
  {
    kind: "text",
    id: "m1",
    role: "system",
    text: "已为您接入「智能客服」,看到您正在观看《周末游戏直播》",
    ts: Date.now() - 60000,
  },
  {
    kind: "text",
    id: "m2",
    role: "ai",
    text: "你好,我是直播平台的智能助手 ✨ 我可以帮你处理:\n· 卡顿 / 黑屏 / 清晰度\n· 会员订阅 / 续费 / 退款\n· 弹幕 / 礼物 / 举报\n· 转人工",
    ts: Date.now() - 50000,
  },
];
