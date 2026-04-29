/**
 * 极简 i18n — 不引大库,字典 + ?lang= URL 参数切换,Apply 监听 storage 事件。
 *
 * 用法:
 *   t("composer.placeholder")
 *   getLang() / setLang("en")
 */

type Dict = Record<string, string>;

const ZH: Dict = {
  "composer.placeholder": "输入消息...",
  "composer.send": "发送",
  "composer.attach": "添加附件",
  "csat.title": "本次服务怎么样?",
  "csat.submitted": "感谢您的评价 ✨",
  "csat.revising": "30s 内可修改",
  "csat.submit": "提交评价",
  "csat.resubmit": "重新提交",
  "tool.confirm": "确认执行",
  "tool.cancel": "取消",
  "tool.retry": "重试",
  "room.diag": "播放诊断",
  "room.diag.running": "诊断中…",
  "room.reenter": "重进直播间",
};

const EN: Dict = {
  "composer.placeholder": "Type a message...",
  "composer.send": "Send",
  "composer.attach": "Attach file",
  "csat.title": "How was your experience?",
  "csat.submitted": "Thanks for the feedback ✨",
  "csat.revising": "Can revise within 30s",
  "csat.submit": "Submit",
  "csat.resubmit": "Resubmit",
  "tool.confirm": "Confirm",
  "tool.cancel": "Cancel",
  "tool.retry": "Retry",
  "room.diag": "Diagnose",
  "room.diag.running": "Diagnosing…",
  "room.reenter": "Re-enter room",
};

const DICTS: Record<string, Dict> = { zh: ZH, en: EN };

export type Lang = "zh" | "en";

export function getLang(): Lang {
  if (typeof window === "undefined") return "zh";
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("lang");
  if (fromUrl === "en" || fromUrl === "zh") return fromUrl;
  const fromStorage = (() => {
    try {
      return localStorage.getItem("aikefu.lang");
    } catch {
      return null;
    }
  })();
  if (fromStorage === "en" || fromStorage === "zh") return fromStorage;
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "zh";
}

export function setLang(l: Lang): void {
  try {
    localStorage.setItem("aikefu.lang", l);
  } catch {
    /* ignore */
  }
}

export function t(key: string): string {
  const dict = DICTS[getLang()] ?? ZH;
  return dict[key] ?? key;
}
