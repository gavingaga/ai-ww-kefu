import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientStatus, ReconnectingWS } from "@ai-kefu/ws-client";
import { GlassCard, MarqueeBar } from "@ai-kefu/ui-glass";

import { Composer } from "./components/Composer.js";
import { ConnectionBar } from "./components/ConnectionBar.js";
import { MessageList } from "./components/MessageList.js";
import { QuickReplies } from "./components/QuickReplies.js";
import { announcements, initialMessages, quickReplies, type Message } from "./mocks/data.js";
import { createWs } from "./ws/createClient.js";

/**
 * C 端 Web H5 入口 — 布局四区。
 *
 * 行为:
 *  - 优先连真实 WS(VITE_WS_URL),状态条根据 status 显示
 *  - 无 WS / 未连接时:本地 echo 演示链路通畅(等 M2 ai-hub 接入)
 *  - 服务端 msg.text 帧到达时,按 client_msg_id / role 渲染气泡
 */
export function App() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [status, setStatus] = useState<ClientStatus>({
    state: "idle",
    attempts: 0,
    recvSeq: 0,
    pending: 0,
  });

  const wsRef = useRef<ReconnectingWS | null>(null);

  useEffect(() => {
    const ws = createWs();
    if (!ws) return;
    wsRef.current = ws;
    const offState = ws.on("status", setStatus);
    const offFrame = ws.on("frame", (f) => {
      if (f.type === "msg.text" && typeof f.payload?.text === "string") {
        const role = (f.payload.role as Message["role"]) ?? "ai";
        setMessages((prev) => [
          ...prev.filter((m) => !m.thinking),
          {
            id: f.msg_id ?? `s-${f.seq ?? Date.now()}`,
            role,
            text: String(f.payload?.text),
            ts: f.ts ?? Date.now(),
          },
        ]);
      }
    });
    ws.start();
    return () => {
      offState();
      offFrame();
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const sendUser = useCallback((text: string) => {
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    const placeholder: Message = {
      id: `a-${Date.now()}`,
      role: "ai",
      text: "",
      ts: Date.now() + 1,
      thinking: true,
    };
    setMessages((prev) => [...prev, userMsg, placeholder]);

    const ws = wsRef.current;
    if (ws && ws.status().state === "open") {
      ws.send({
        type: "msg.text",
        session_id: "ses_demo",
        payload: { text },
      });
      // 真实回复由服务端推送替换 placeholder
      return;
    }

    // 离线兜底 — 让骨架可单独跑
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.thinking
            ? {
                ...m,
                thinking: false,
                text:
                  "已收到。AI/RAG/工具 链路接入后,这里会给到具体答复。\n(当前为离线 mock,未连接 ws)",
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
        <ConnectionBar status={status} />

        <MarqueeBar
          items={announcements}
          onClose={(it) => {
            // 24h 内不再展示
            try {
              const key = "aikefu.announce.closed";
              const map = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number>;
              map[String(it.id)] = Date.now();
              localStorage.setItem(key, JSON.stringify(map));
            } catch {
              /* SSR / 隐私模式 */
            }
          }}
        />

        <MessageList items={messages} />

        <QuickReplies items={quickReplies} onSend={sendUser} />

        <Composer onSend={sendUser} />
      </GlassCard>
    </div>
  );
}
