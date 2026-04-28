package com.aikefu.routing.domain;

/**
 * 坐席状态机(详见 PRD 04 §4)。
 *
 * <pre>
 *  OFFLINE ─登录─► IDLE ─派单─► BUSY ─结束─► IDLE
 *                   │              │
 *                   └置忙 / 暂离─► AWAY
 * </pre>
 */
public enum AgentStatus {
  OFFLINE,
  IDLE,
  BUSY,
  AWAY;

  public boolean canPickWork() {
    return this == IDLE;
  }
}
