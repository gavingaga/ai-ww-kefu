/**
 * WS 客户端协议类型
 *
 * 字段层与 packages/proto/ws/{client,events}.schema.json 一一对应。
 * 这里手写一套精简 TS 类型,等 codegen-ts 跑通后可改为
 *   import type { WsClientFrame } from "@ai-kefu/proto/ws/client";
 * 不过手写版本对单测稳定,生成版本作为契约校验来源。
 */

export type ClientFrameType =
  | "msg.text"
  | "msg.image"
  | "msg.file"
  | "msg.read"
  | "msg.recall"
  | "event.typing"
  | "event.handoff"
  | "event.context"
  | "ping"
  | "pong"
  | "ack"
  | "pull"
  | "error";

export type ServerFrameType =
  | "msg.text"
  | "msg.image"
  | "msg.file"
  | "msg.card"
  | "msg.faq"
  | "msg.system"
  | "msg.chunk"
  | "msg.recall"
  | "event.queue_update"
  | "event.agent_join"
  | "event.agent_leave"
  | "event.session_close"
  | "event.announcement_update"
  | "event.quick_reply_update"
  | "event.faq_update"
  | "event.faq_card"
  | "event.live_snapshot"
  | "event.play_diagnostic"
  | "event.bridge_call"
  | "pong"
  | "error";

export interface FrameBase {
  type: string;
  seq?: number;
  ack?: number;
  ts?: number;
  session_id?: string;
  msg_id?: string;
  client_msg_id?: string;
  payload?: Record<string, unknown>;
}

export interface ClientFrame extends FrameBase {
  type: ClientFrameType;
}

export interface ServerFrame extends FrameBase {
  type: ServerFrameType;
}

export type WsState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "reconnecting"
  | "fatal";

export interface ClientStatus {
  state: WsState;
  attempts: number;
  lastError?: string;
  /** 收到的最大 seq */
  recvSeq: number;
  /** 待重发的客户端帧数量 */
  pending: number;
}
