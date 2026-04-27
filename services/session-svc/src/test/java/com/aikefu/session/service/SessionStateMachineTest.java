package com.aikefu.session.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.aikefu.session.domain.SessionStatus;

class SessionStateMachineTest {

  private final SessionStateMachine sm = new SessionStateMachine();

  @Test
  void allowsAiToQueueing() {
    assertThat(sm.canTransition(SessionStatus.AI, SessionStatus.QUEUEING)).isTrue();
  }

  @Test
  void allowsQueueingToInAgent() {
    assertThat(sm.canTransition(SessionStatus.QUEUEING, SessionStatus.IN_AGENT)).isTrue();
  }

  @Test
  void allowsInAgentBackToAi() {
    assertThat(sm.canTransition(SessionStatus.IN_AGENT, SessionStatus.AI)).isTrue();
  }

  @Test
  void closedIsTerminal() {
    assertThat(sm.canTransition(SessionStatus.CLOSED, SessionStatus.AI)).isFalse();
    assertThat(sm.canTransition(SessionStatus.CLOSED, SessionStatus.QUEUEING)).isFalse();
    assertThatThrownBy(() -> sm.check(SessionStatus.CLOSED, SessionStatus.AI))
        .isInstanceOf(SessionStateMachine.IllegalStateTransitionException.class);
  }

  @Test
  void sameStateIsIdempotent() {
    sm.check(SessionStatus.AI, SessionStatus.AI);
  }

  @Test
  void aiCannotJumpToInAgent() {
    assertThat(sm.canTransition(SessionStatus.AI, SessionStatus.IN_AGENT)).isFalse();
    assertThatThrownBy(() -> sm.check(SessionStatus.AI, SessionStatus.IN_AGENT))
        .isInstanceOf(SessionStateMachine.IllegalStateTransitionException.class);
  }
}
