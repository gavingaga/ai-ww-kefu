package com.aikefu.session.domain;

/**
 * 会话状态。详见 PRD 01-业务流程与场景.md §1。
 *
 * <pre>
 *     AI ──(置信度低 / 命中规则 / 用户主动)──▶ QUEUEING ──(分配)──▶ IN_AGENT ──(结束)──▶ CLOSED
 *      │                                                                              ▲
 *      └────────────────────(直接结束)─────────────────────────────────────────────────┘
 * </pre>
 */
public enum SessionStatus {
  /** AI 主导。 */
  AI,
  /** 已请求转人工,排队中。 */
  QUEUEING,
  /** 人工坐席接入中。 */
  IN_AGENT,
  /** 已结束(用户主动 / 坐席结束 / 超时关闭)。 */
  CLOSED;

  /** 是否终态。 */
  public boolean isTerminal() {
    return this == CLOSED;
  }
}
