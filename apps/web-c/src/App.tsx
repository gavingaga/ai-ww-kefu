import { useCallback, useState } from "react";

import { GlassCard, MarqueeBar } from "@ai-kefu/ui-glass";

import { Composer } from "./components/Composer.js";
import { MessageList } from "./components/MessageList.js";
import { QuickReplies } from "./components/QuickReplies.js";
import { announcements, initialMessages, quickReplies, type Message } from "./mocks/data.js";

/**
 * C 端 Web H5 入口 — M0 应用骨架,布局四区:
 *   ① 公告跑马灯
 *   ② 消息流
 *   ③ 快捷按钮
 *   ④ 输入区
 *
 * 数据源全部为 mock,等 T-110(WS reconnect)+ T-104(session-svc)+ T-107(notify-svc)
 * 接通后由真实 API/WS 替换。
 */
export function App() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  const sendUser = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text, ts: Date.now() },
      // 临时占位:AI 思考气泡 → 800ms 后简单回声(后续由 ai-hub 流式替换)
      { id: `a-${Date.now()}`, role: "ai", text: "", ts: Date.now() + 1, thinking: true },
    ]);
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.thinking
            ? {
                ...m,
                thinking: false,
                text: "已收到。AI/RAG/工具调用 链路接入后,这里会给到具体答复。",
              }
            : m,
        ),
      );
    }, 900);
  }, []);

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        padding: "max(env(safe-area-inset-top), 12px) 12px 0",
      }}
    >
      <GlassCard
        strength="base"
        ring
        radius={20}
        style={{
          width: "100%",
          maxWidth: 720,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <MarqueeBar
          items={announcements}
          onClose={(it) => {
            // 记忆 24h 不再展示(M4 完整体验 Story 接 localStorage)
            console.warn("[announcement-close]", it.id);
          }}
        />

        <MessageList items={messages} />

        <QuickReplies items={quickReplies} onSend={sendUser} />

        <Composer onSend={sendUser} />
      </GlassCard>
    </div>
  );
}
