import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientStatus, ReconnectingWS } from "@ai-kefu/ws-client";
import { GlassCard, MarqueeBar } from "@ai-kefu/ui-glass";

import { Composer } from "./components/Composer.js";
import { ConnectionBar } from "./components/ConnectionBar.js";
import { MessageList } from "./components/MessageList.js";
import { QuickReplies } from "./components/QuickReplies.js";
import {
  announcements,
  initialMessages,
  quickReplies,
  type FaqAnswer,
  type Message,
  type ToolCallContent,
} from "./mocks/data.js";
import { createWs } from "./ws/createClient.js";

const SESSION_ID = "ses_demo";

/**
 * C 端 Web H5 入口 — 布局四区。
 *
 * 行为:
 *  - 优先连真实 WS(VITE_WS_URL),状态条根据 status 显示
 *  - 无 WS / 未连接时:本地 echo 演示链路通畅
 *  - 服务端帧:
 *    · msg.text → 文本气泡(role 区分 AI / 坐席 / 系统)
 *    · msg.faq  → FAQ 卡片(零 token,带 actions / follow_ups)
 *    · msg.chunk{end:true} → 关流式(由占位 thinking 的气泡转正常)
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
      // 1) 文本消息(含 msg.text / msg.system / msg.image / msg.file 等)
      if (
        (f.type === "msg.text" || f.type === "msg.system") &&
        typeof f.payload?.text === "string"
      ) {
        const fallback = f.type === "msg.system" ? "system" : "ai";
        const role = (f.payload.role as "ai" | "agent" | "system" | "user") ?? fallback;
        // user 帧通常是回执(sessionRouter 写入后的同一条);保留 client_msg_id 去重
        const cmid = f.payload?.client_msg_id ? String(f.payload.client_msg_id) : null;
        setMessages((prev) => {
          const cleaned = prev.filter((m) => !(m.kind === "text" && m.thinking));
          if (cmid && cleaned.some((m) => m.id === `u-${cmid}`)) {
            // 已经有同 client_msg_id 的本地用户气泡,跳过(或只更新状态)
            return cleaned;
          }
          if (role === "user") {
            // 服务端回写的 user 回执 — 不再重复渲染
            return cleaned;
          }
          return [
            ...cleaned,
            {
              kind: "text",
              id: f.msg_id ?? `s-${f.seq ?? Date.now()}`,
              role,
              text: String(f.payload?.text),
              ts: f.ts ?? Date.now(),
            },
          ];
        });
        return;
      }
      // 2) FAQ 卡片
      if (f.type === "msg.faq") {
        const p = f.payload ?? {};
        setMessages((prev) => [
          ...prev.filter((m) => !(m.kind === "text" && m.thinking)),
          {
            kind: "faq",
            id: f.msg_id ?? `faq-${f.seq ?? Date.now()}`,
            role: "ai",
            ts: f.ts ?? Date.now(),
            faq: {
              nodeId: String(p.node_id ?? ""),
              title: String(p.title ?? ""),
              how: (p.how as "exact" | "similar" | undefined) ?? "exact",
              score: typeof p.score === "number" ? p.score : undefined,
              answer: (p.answer as FaqAnswer) ?? {},
            },
          },
        ]);
        return;
      }
      // 3) 工具调用结果(AI 触发,UI 展示一个胶囊)
      if (f.type === "event.tool_call") {
        const p = f.payload ?? {};
        setMessages((prev) => {
          // 把仍在 thinking 的占位气泡的文案换成"已查询 N 个工具,正在整理回复"
          // 让用户感知 AI 正在干活,不至于盯着空泡 5+ 秒
          const toolCount = prev.filter((x) => x.kind === "tool").length + 1;
          const updated = prev.map((m) =>
            m.kind === "text" && m.thinking
              ? { ...m, text: `已查询 ${toolCount} 个工具,正在整理回复…` }
              : m,
          );
          return [
            ...updated,
            {
              kind: "tool",
              id: `tool-${f.seq ?? Date.now()}`,
              role: "ai",
              ts: f.ts ?? Date.now(),
              tool: {
                name: String(p.name ?? ""),
                args: (p.args as Record<string, unknown>) ?? undefined,
                ok: Boolean(p.ok),
                result: p.result,
                error: typeof p.error === "string" ? p.error : undefined,
              },
            },
          ];
        });
        return;
      }
      // 3.1) RAG 引用(AI 答复时附带的知识库引用)
      if (f.type === "event.rag_chunks") {
        const p = f.payload ?? {};
        const chunks = Array.isArray(p.chunks) ? p.chunks : [];
        setMessages((prev) => [
          ...prev,
          {
            kind: "rag",
            id: `rag-${f.seq ?? Date.now()}`,
            role: "ai",
            ts: f.ts ?? Date.now(),
            rag: {
              topTitle: typeof p.top_title === "string" ? p.top_title : undefined,
              score: typeof p.score === "number" ? p.score : undefined,
              chunks: chunks as Array<Record<string, unknown>>,
            },
          },
        ]);
        return;
      }
      // 4) 流式结束 — 占位思考气泡转正常(若仍为空,显示提示)
      if (f.type === "msg.chunk" && f.payload?.end) {
        setMessages((prev) =>
          prev.map((m) =>
            m.kind === "text" && m.thinking
              ? { ...m, thinking: false, text: m.text || "（已结束）" }
              : m,
          ),
        );
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
      kind: "text",
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    const placeholder: Message = {
      kind: "text",
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
        session_id: SESSION_ID,
        payload: { text },
      });
      return;
    }

    // 离线兜底 — 让骨架可单独跑;若命中本地 FAQ 关键词则演示卡片样式
    setTimeout(() => {
      const localFaq = mockFaqFor(text);
      if (localFaq) {
        setMessages((prev) => [
          ...prev.filter((m) => !(m.kind === "text" && m.thinking)),
          {
            kind: "faq",
            id: `faq-mock-${Date.now()}`,
            role: "ai",
            ts: Date.now(),
            faq: localFaq,
          },
        ]);
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.kind === "text" && m.thinking
            ? {
                ...m,
                thinking: false,
                text:
                  "已收到。AI / FAQ / RAG 链路接入后,这里会给到具体答复。\n(当前为离线 mock,未连接 ws)",
              }
            : m,
        ),
      );
    }, 900);
  }, []);

  /** 离线 mock:命中常见关键词时返回一条 FAQ 卡片演示数据,生产环境由 ws msg.faq 帧替换。 */
  function mockFaqFor(input: string) {
    const t = input.trim();
    if (!t) return null;
    if (/卡|缓冲|不流畅/.test(t)) {
      return {
        nodeId: "play.buffer",
        title: "我看视频卡顿怎么办?",
        how: "similar" as const,
        score: 0.92,
        answer: {
          contentMd:
            "建议依次尝试:\n1. 切换到 **流畅 / 480p** 清晰度\n2. 切换 Wi-Fi / 4G 网络\n3. 退出直播间重新进入\n如仍卡顿,可点击下方「转人工」让技术支持介入。",
          actions: [
            { type: "send_text" as const, label: "切到 480p", payload: "请帮我把清晰度切到 480p" },
            { type: "handoff" as const, label: "转人工" },
          ],
          followUps: [
            { id: "play.black", title: "黑屏 / 无画面" },
            { id: "play.no_sound", title: "有画面没声音" },
          ],
        },
      };
    }
    if (/取消|退订|包月/.test(t)) {
      return {
        nodeId: "ms.cancel",
        title: "怎么取消连续包月 / 自动续费?",
        how: "exact" as const,
        score: 1.0,
        answer: {
          contentMd:
            "iOS:打开 `设置 → Apple ID → 订阅` 关闭自动续费;\nAndroid:Google Play / 应用商店 → 订阅 → 关闭。",
          actions: [
            {
              type: "open_link" as const,
              label: "打开订阅管理",
              payload: "https://example.com/help/subscription",
            },
            { type: "handoff" as const, label: "转人工" },
          ],
        },
      };
    }
    return null;
  }

  const handoffToAgent = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.status().state === "open") {
      ws.send({ type: "event.handoff", session_id: SESSION_ID });
    }
    setMessages((prev) => [
      ...prev,
      {
        kind: "text",
        id: `sys-${Date.now()}`,
        role: "system",
        text: "正在为你转人工,稍候坐席介入...",
        ts: Date.now(),
      },
    ]);
  }, []);

  const onToolConfirm = useCallback(
    (tool: ToolCallContent) => {
      const argsBrief = tool.args
        ? Object.entries(tool.args)
            .slice(0, 3)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(", ")
        : "";
      const human = `确认执行 ${tool.name}${argsBrief ? "(" + argsBrief + ")" : ""}`;
      sendUser(human);
    },
    [sendUser],
  );

  const onToolCancel = useCallback(
    (tool: ToolCallContent) => {
      sendUser(`不执行 ${tool.name},取消该操作`);
    },
    [sendUser],
  );

  const onToolRetry = useCallback(
    (tool: ToolCallContent) => {
      sendUser(`刚才 ${tool.name} 失败了,请重试`);
    },
    [sendUser],
  );

  const openLink = useCallback((url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    // WebView 优先经 JSBridge
    const bridge = (window as unknown as { kefu?: { openLink?: (u: string) => void } }).kefu;
    if (bridge?.openLink) {
      try {
        bridge.openLink(url);
        return;
      } catch {
        /* fallback */
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
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

        <MessageList
          items={messages}
          onSend={sendUser}
          onHandoff={handoffToAgent}
          onOpenLink={openLink}
          onToolConfirm={onToolConfirm}
          onToolCancel={onToolCancel}
          onToolRetry={onToolRetry}
        />

        <QuickReplies items={quickReplies} onSend={sendUser} />

        <Composer onSend={sendUser} />
      </GlassCard>
    </div>
  );
}
