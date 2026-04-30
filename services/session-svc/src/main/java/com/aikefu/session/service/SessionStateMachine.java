package com.aikefu.session.service;

import java.util.EnumSet;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.aikefu.session.domain.SessionStatus;

/**
 * 会话状态机 — 集中管理合法跃迁。非法跃迁抛 {@link IllegalStateTransitionException},
 * 上层 controller 转译为 HTTP 409。
 *
 * <p>跃迁表(详见 PRD 01-业务流程与场景.md):
 *
 * <pre>
 *   AI         → QUEUEING / IN_AGENT(主管 steal / 直接接管,跳过排队) / CLOSED
 *   QUEUEING   → IN_AGENT / AI / CLOSED
 *   IN_AGENT   → CLOSED / QUEUEING(转接) / AI(回托管)
 *   CLOSED     → (终态,任何跃迁非法)
 * </pre>
 */
@Component
public class SessionStateMachine {
  private static final Map<SessionStatus, EnumSet<SessionStatus>> ALLOWED =
      Map.of(
          SessionStatus.AI,
              EnumSet.of(SessionStatus.QUEUEING, SessionStatus.IN_AGENT, SessionStatus.CLOSED),
          SessionStatus.QUEUEING,
              EnumSet.of(SessionStatus.IN_AGENT, SessionStatus.AI, SessionStatus.CLOSED),
          SessionStatus.IN_AGENT,
              EnumSet.of(SessionStatus.CLOSED, SessionStatus.QUEUEING, SessionStatus.AI),
          SessionStatus.CLOSED, EnumSet.noneOf(SessionStatus.class));

  /** 校验跃迁;非法直接抛错。 */
  public void check(SessionStatus from, SessionStatus to) {
    if (from == to) {
      // 幂等:同状态无意义跃迁不报错(便于重放)。
      return;
    }
    EnumSet<SessionStatus> allowed = ALLOWED.getOrDefault(from, EnumSet.noneOf(SessionStatus.class));
    if (!allowed.contains(to)) {
      throw new IllegalStateTransitionException(
          "illegal transition: " + from + " -> " + to + ", allowed=" + allowed);
    }
  }

  /** 是否允许从 from 跃迁到 to。 */
  public boolean canTransition(SessionStatus from, SessionStatus to) {
    if (from == to) return true;
    return ALLOWED.getOrDefault(from, EnumSet.noneOf(SessionStatus.class)).contains(to);
  }

  /** 非法状态跃迁。 */
  public static class IllegalStateTransitionException extends IllegalStateException {
    public IllegalStateTransitionException(String message) {
      super(message);
    }
  }
}
