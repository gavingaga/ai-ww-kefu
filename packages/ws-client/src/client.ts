/**
 * ReconnectingWS — 客户端 WebSocket wrapper。
 *
 * 能力:
 *  - 重连(指数退避 + 抖动,可手动 close 终止)
 *  - 心跳:每 25s ping,30s 无包断连重连
 *  - 客户端消息:自动注入 client_msg_id(若未给),离线/重连期间入队,恢复后顺序重发
 *  - 服务端消息:接收顺序检查,缺失时主动 pull(after_seq=最大已收 seq)
 *  - 周期 ack:每 N 条或每 5s 上报最大已收 seq,供服务端裁剪 pending
 *  - 协议帧约束源自 packages/proto/ws/{client,events}.schema.json,详见 PRD §08 §4
 *
 * 不做(交给上层):
 *  - 弱网降级(SSE / 长轮询 — 上层 manager 决策)
 *  - 全局心跳监控告警 — 由可观测层负责
 */

import { nextDelay, type BackoffOpts } from "./backoff.js";
import { Emitter, type Unsubscribe } from "./emitter.js";
import type {
  ClientFrame,
  ClientFrameType,
  ClientStatus,
  ServerFrame,
  ServerFrameType,
  WsState,
} from "./types.js";

export interface ReconnectingWSOptions {
  /** WS 端点(可附 token) */
  url: string | (() => string | Promise<string>);
  /** 心跳间隔,默认 25s */
  heartbeatIntervalMs?: number;
  /** 心跳超时(收不到任何包),默认 30s */
  heartbeatTimeoutMs?: number;
  /** 周期 ack 间隔,默认 5s */
  ackIntervalMs?: number;
  /** 客户端消息发送队列上限,默认 200 */
  pendingLimit?: number;
  /** 单连接最大重连次数,默认无限 */
  maxAttempts?: number;
  /** 重连退避配置 */
  backoff?: BackoffOpts;
  /** 客户端 msg id 生成器,默认 crypto.randomUUID() */
  newClientMsgId?: () => string;
  /** 测试用:WebSocket 工厂 */
  socketFactory?: (url: string) => WebSocketLike;
  /** 收到帧后立即排序与去重,默认 true */
  reorder?: boolean;
}

export interface WebSocketLike {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev?: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

const OPEN = 1;
// const CLOSING = 2;  // 仅供参考
// const CLOSED = 3;

interface PendingFrame {
  frame: ClientFrame;
  /** 下次允许重发的时间;未发送过为 0 */
  nextSendAt: number;
}

interface Events {
  state: WsState;
  open: void;
  close: { code?: number; reason?: string; willReconnect: boolean };
  error: { message: string };
  /** 收到的服务端帧(已去重 + 顺序保证) */
  frame: ServerFrame;
  /** 检测到 seq 缺漏,即将发 pull */
  gap: { from: number; to: number };
  /** 状态变更,UI 可绑定显示连接条 */
  status: ClientStatus;
}

export class ReconnectingWS {
  private opts: Required<Omit<ReconnectingWSOptions, "socketFactory" | "backoff" | "maxAttempts">> &
    Pick<ReconnectingWSOptions, "socketFactory" | "backoff" | "maxAttempts">;
  private emitter = new Emitter<Events>();

  private socket: WebSocketLike | null = null;
  private state: WsState = "idle";
  private attempts = 0;
  private manualClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private ackTimer: ReturnType<typeof setInterval> | null = null;

  private pending: PendingFrame[] = [];
  private recvSeq = 0;
  private pendingAckSeq = 0;
  private lastFrameAt = 0;
  private gapPullInflight = false;

  constructor(options: ReconnectingWSOptions) {
    this.opts = {
      heartbeatIntervalMs: 25_000,
      heartbeatTimeoutMs: 30_000,
      ackIntervalMs: 5_000,
      pendingLimit: 200,
      reorder: true,
      newClientMsgId: defaultClientMsgId,
      socketFactory: options.socketFactory,
      backoff: options.backoff,
      maxAttempts: options.maxAttempts,
      ...options,
    };
  }

  // ───── 公共 API ─────────────────────────────────────────────

  on<K extends keyof Events>(event: K, fn: (p: Events[K]) => void): Unsubscribe {
    return this.emitter.on(event, fn);
  }

  /** 已收到的最大 seq,断网重连后用于发 pull */
  get receivedSeq(): number {
    return this.recvSeq;
  }

  status(): ClientStatus {
    return {
      state: this.state,
      attempts: this.attempts,
      recvSeq: this.recvSeq,
      pending: this.pending.length,
    };
  }

  start(): void {
    this.manualClosed = false;
    void this.connect();
  }

  /** 手动关闭(不再重连) */
  close(code?: number, reason?: string): void {
    this.manualClosed = true;
    this.clearTimers();
    this.setState("closed");
    try {
      this.socket?.close(code, reason);
    } catch {
      /* ignore */
    }
    this.socket = null;
  }

  /**
   * 发送客户端帧。会自动:
   *  - 注入 ts
   *  - 对 msg.* 注入 client_msg_id(幂等)
   *  - 未连接时入队,连接后顺序发送
   */
  send(frame: Omit<ClientFrame, "ts"> & { ts?: number }): void {
    const enriched: ClientFrame = {
      ts: Date.now(),
      ...frame,
    };
    if (
      isClientMsgFrame(enriched.type) &&
      !enriched.client_msg_id
    ) {
      enriched.client_msg_id = this.opts.newClientMsgId();
    }
    if (this.pending.length >= this.opts.pendingLimit) {
      // 丢弃最旧的非业务帧(typing 等),否则丢弃最旧的业务帧并 emit 错误
      const idx = this.pending.findIndex((p) => !isClientMsgFrame(p.frame.type));
      if (idx >= 0) {
        this.pending.splice(idx, 1);
      } else {
        this.pending.shift();
        this.emitter.emit("error", { message: "pending overflow, oldest dropped" });
      }
    }
    this.pending.push({ frame: enriched, nextSendAt: 0 });
    this.flush();
    this.emitStatus();
  }

  /** 主动重发任何未确认的客户端帧 */
  flush(): void {
    if (!this.socket || this.socket.readyState !== OPEN) return;
    const now = Date.now();
    for (const p of this.pending) {
      if (p.nextSendAt > now) continue;
      try {
        this.socket.send(JSON.stringify(this.attachAck(p.frame)));
        // ack 上报后清账
        this.pendingAckSeq = this.recvSeq;
        // 标注下一次最早重发时间(若长时间未被 server 确认,例如 30s 后再尝试)
        p.nextSendAt = now + 30_000;
      } catch (err) {
        this.emitter.emit("error", {
          message: `send failed: ${(err as Error)?.message ?? err}`,
        });
        break;
      }
    }
  }

  // ───── 内部 ────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.state === "open" || this.state === "connecting") return;
    this.setState(this.attempts === 0 ? "connecting" : "reconnecting");
    let url: string;
    try {
      url = typeof this.opts.url === "function" ? await this.opts.url() : this.opts.url;
    } catch (err) {
      this.emitter.emit("error", { message: `resolve url failed: ${(err as Error)?.message}` });
      this.scheduleReconnect();
      return;
    }

    let socket: WebSocketLike;
    try {
      socket = this.opts.socketFactory
        ? this.opts.socketFactory(url)
        : (new WebSocket(url) as unknown as WebSocketLike);
    } catch (err) {
      this.emitter.emit("error", { message: `socket open failed: ${(err as Error)?.message}` });
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.onOpen();
    socket.onmessage = (ev) => this.onRawMessage(ev.data);
    socket.onclose = (ev) => this.onClose(ev?.code, ev?.reason);
    socket.onerror = () => {
      // 不主动断,onclose 会被触发
      this.emitter.emit("error", { message: "socket error" });
    };
  }

  private onOpen(): void {
    this.attempts = 0;
    this.setState("open");
    this.lastFrameAt = Date.now();
    this.startHeartbeat();
    this.startAck();
    // 重连后:若收过任何 seq,主动 pull 增量
    if (this.recvSeq > 0) {
      this.send({
        type: "pull",
        payload: { after_seq: this.recvSeq },
      });
    }
    // 把队列里未发的帧 flush
    this.flush();
    this.emitter.emit("open", undefined);
    this.emitStatus();
  }

  private onClose(code?: number, reason?: string): void {
    this.clearTimers();
    this.socket = null;
    if (this.manualClosed) {
      this.setState("closed");
      this.emitter.emit("close", { code, reason, willReconnect: false });
      return;
    }
    this.emitter.emit("close", { code, reason, willReconnect: true });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.opts.maxAttempts != null && this.attempts >= this.opts.maxAttempts) {
      this.setState("fatal");
      return;
    }
    const delay = nextDelay(this.attempts, this.opts.backoff);
    this.attempts += 1;
    this.setState("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private onRawMessage(raw: string): void {
    this.lastFrameAt = Date.now();
    let frame: ServerFrame;
    try {
      frame = JSON.parse(raw) as ServerFrame;
    } catch {
      this.emitter.emit("error", { message: "bad json frame" });
      return;
    }

    // pong / 心跳辅助 — 不参与业务顺序
    if (frame.type === "pong" || frame.type === "error") {
      this.emitter.emit("frame", frame);
      return;
    }

    if (typeof frame.seq === "number") {
      // 顺序检查
      if (frame.seq <= this.recvSeq) {
        // 重复帧,丢弃
        return;
      }
      if (frame.seq > this.recvSeq + 1 && this.opts.reorder && !this.gapPullInflight) {
        // 缺漏,主动 pull
        this.emitter.emit("gap", { from: this.recvSeq, to: frame.seq });
        this.gapPullInflight = true;
        this.send({ type: "pull", payload: { after_seq: this.recvSeq } });
      }
      this.recvSeq = frame.seq;
    }
    this.emitter.emit("frame", frame);

    // 业务帧到达后,清掉对应客户端 pending(以 client_msg_id 关联)
    if (frame.type.startsWith("msg.") && frame.payload?.client_msg_id) {
      const cmid = String(frame.payload.client_msg_id);
      this.pending = this.pending.filter(
        (p) => p.frame.client_msg_id !== cmid,
      );
    }
    this.gapPullInflight = false;
    this.emitStatus();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== OPEN) return;
      try {
        this.socket.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      } catch {
        /* ignore */
      }
      // 超时检测
      const since = Date.now() - this.lastFrameAt;
      if (since > this.opts.heartbeatTimeoutMs) {
        this.emitter.emit("error", {
          message: `heartbeat timeout ${since}ms,主动断开重连`,
        });
        try {
          this.socket?.close(4000, "heartbeat-timeout");
        } catch {
          /* ignore */
        }
      }
    }, this.opts.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.heartbeatTimeoutTimer) clearTimeout(this.heartbeatTimeoutTimer);
    this.heartbeatTimeoutTimer = null;
  }

  private startAck(): void {
    if (this.ackTimer) clearInterval(this.ackTimer);
    this.ackTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== OPEN) return;
      if (this.recvSeq > this.pendingAckSeq) {
        try {
          this.socket.send(
            JSON.stringify({ type: "ack", ack: this.recvSeq, ts: Date.now() }),
          );
          this.pendingAckSeq = this.recvSeq;
        } catch {
          /* ignore */
        }
      }
    }, this.opts.ackIntervalMs);
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.ackTimer) clearInterval(this.ackTimer);
    this.ackTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setState(s: WsState): void {
    if (this.state === s) return;
    this.state = s;
    this.emitter.emit("state", s);
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emitter.emit("status", this.status());
  }

  private attachAck(frame: ClientFrame): ClientFrame {
    if (frame.type === "ping" || frame.type === "ack") return frame;
    return this.recvSeq > 0 ? { ...frame, ack: this.recvSeq } : frame;
  }
}

function isClientMsgFrame(t: ClientFrameType | ServerFrameType): boolean {
  return t === "msg.text" || t === "msg.image" || t === "msg.file";
}

function defaultClientMsgId(): string {
  // 优先 crypto.randomUUID();老环境 fallback。
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
