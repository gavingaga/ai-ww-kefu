import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReconnectingWS, type WebSocketLike } from "../index.js";
import type { ClientFrame, ServerFrame } from "../types.js";

/**
 * Fake WebSocket — 由测试驱动 open / message / close。
 */
class FakeWS implements WebSocketLike {
  readyState = 0;
  sent: ClientFrame[] = [];
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev?: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  constructor(public url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientFrame);
  }
  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  // 测试 helpers
  acceptOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  serverPush(frame: ServerFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  drop(code = 1006, reason = "abnormal"): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

describe("ReconnectingWS", () => {
  let factoryCalls: FakeWS[] = [];

  function makeClient(overrides: Partial<Parameters<typeof ReconnectingWS>[0]> = {}) {
    factoryCalls = [];
    return new ReconnectingWS({
      url: "ws://x",
      heartbeatIntervalMs: 1_000_000, // 测试中靠手动控制
      heartbeatTimeoutMs: 1_000_000,
      ackIntervalMs: 1_000_000,
      socketFactory: (url) => {
        const ws = new FakeWS(url);
        factoryCalls.push(ws);
        return ws;
      },
      backoff: { baseMs: 10, maxMs: 50, jitter: 0 },
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("成功握手后状态切到 open,先前入队的帧被发送", () => {
    const c = makeClient();
    c.send({ type: "msg.text", session_id: "ses_1", payload: { text: "hi" } });
    c.start();
    expect(factoryCalls.length).toBe(1);
    factoryCalls[0]!.acceptOpen();
    // open 后 flush
    const sent = factoryCalls[0]!.sent;
    expect(sent.some((f) => f.type === "msg.text" && f.client_msg_id)).toBe(true);
  });

  it("send 自动注入 client_msg_id(幂等)", () => {
    const c = makeClient();
    c.start();
    factoryCalls[0]!.acceptOpen();
    c.send({ type: "msg.text", session_id: "ses_1", payload: { text: "x" } });
    const f = factoryCalls[0]!.sent.find((m) => m.type === "msg.text");
    expect(f?.client_msg_id).toBeTruthy();
  });

  it("seq 递增的服务端帧按序 emit;重复帧被丢弃", () => {
    const c = makeClient();
    const got: number[] = [];
    c.on("frame", (f) => f.seq != null && got.push(f.seq));
    c.start();
    factoryCalls[0]!.acceptOpen();
    factoryCalls[0]!.serverPush({ type: "msg.text", session_id: "s", seq: 1 });
    factoryCalls[0]!.serverPush({ type: "msg.text", session_id: "s", seq: 2 });
    factoryCalls[0]!.serverPush({ type: "msg.text", session_id: "s", seq: 2 }); // dup
    expect(got).toEqual([1, 2]);
    expect(c.receivedSeq).toBe(2);
  });

  it("seq 缺漏时 emit gap 并发送 pull", () => {
    const c = makeClient();
    const gaps: Array<{ from: number; to: number }> = [];
    c.on("gap", (g) => gaps.push(g));
    c.start();
    factoryCalls[0]!.acceptOpen();
    factoryCalls[0]!.serverPush({ type: "msg.text", session_id: "s", seq: 1 });
    factoryCalls[0]!.serverPush({ type: "msg.text", session_id: "s", seq: 5 });
    expect(gaps).toEqual([{ from: 1, to: 5 }]);
    const pull = factoryCalls[0]!.sent.find((f) => f.type === "pull");
    expect(pull?.payload).toEqual({ after_seq: 1 });
  });

  it("断线后按指数退避重连;重连后发 pull 拉增量", async () => {
    const c = makeClient();
    c.start();
    factoryCalls[0]!.acceptOpen();
    factoryCalls[0]!.serverPush({ type: "msg.text", session_id: "s", seq: 3 });
    factoryCalls[0]!.drop();
    // 第一次退避 base=10ms
    await vi.advanceTimersByTimeAsync(20);
    expect(factoryCalls.length).toBe(2);
    factoryCalls[1]!.acceptOpen();
    const pull = factoryCalls[1]!.sent.find((f) => f.type === "pull");
    expect(pull?.payload).toEqual({ after_seq: 3 });
  });

  it("收到带 client_msg_id 的服务端回执后,从 pending 移除", () => {
    const c = makeClient();
    c.start();
    factoryCalls[0]!.acceptOpen();
    c.send({ type: "msg.text", session_id: "s", client_msg_id: "cmid-1", payload: { text: "x" } });
    expect(c.status().pending).toBe(1);
    factoryCalls[0]!.serverPush({
      type: "msg.text",
      session_id: "s",
      seq: 1,
      payload: { client_msg_id: "cmid-1" },
    });
    expect(c.status().pending).toBe(0);
  });

  it("manual close 不再重连", () => {
    const c = makeClient();
    c.start();
    factoryCalls[0]!.acceptOpen();
    c.close();
    expect(c.status().state).toBe("closed");
    factoryCalls[0]!.drop();
    expect(factoryCalls.length).toBe(1);
  });

  it("pendingLimit 溢出时优先丢弃非业务帧", () => {
    const c = makeClient({ pendingLimit: 3 });
    // 不 start,留在 pending
    c.send({ type: "event.typing", session_id: "s", payload: { typing: true } });
    c.send({ type: "msg.text", session_id: "s", payload: { text: "1" } });
    c.send({ type: "msg.text", session_id: "s", payload: { text: "2" } });
    c.send({ type: "msg.text", session_id: "s", payload: { text: "3" } });
    expect(c.status().pending).toBe(3);
    // typing 应被牺牲
    c.start();
    factoryCalls[0]!.acceptOpen();
    const types = factoryCalls[0]!.sent.map((f) => f.type);
    expect(types.filter((t) => t === "event.typing").length).toBe(0);
    expect(types.filter((t) => t === "msg.text").length).toBe(3);
  });
});
