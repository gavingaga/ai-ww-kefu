package com.aikefu.session.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.aikefu.session.domain.Session;
import com.aikefu.session.domain.SessionStatus;
import com.aikefu.session.persistence.InMemorySessionRepository;

class SessionServiceTest {

  private SessionService svc;

  @BeforeEach
  void setUp() {
    svc = new SessionService(new InMemorySessionRepository(), new SessionStateMachine());
  }

  @Test
  void getOrCreateReusesActive() {
    Session a = svc.getOrCreateCurrent(1L, 100L, "web_h5", null);
    Session b = svc.getOrCreateCurrent(1L, 100L, "web_h5", null);
    assertThat(b.getId()).isEqualTo(a.getId());
    assertThat(a.getStatus()).isEqualTo(SessionStatus.AI);
  }

  @Test
  void closingCreatesNewOnNextCall() {
    Session a = svc.getOrCreateCurrent(1L, 100L, "web_h5", null);
    svc.transition(a.getId(), SessionStatus.CLOSED);
    Session b = svc.getOrCreateCurrent(1L, 100L, "web_h5", null);
    assertThat(b.getId()).isNotEqualTo(a.getId());
  }

  @Test
  void liveContextUpdated() {
    Session a = svc.getOrCreateCurrent(1L, 100L, "web_h5", null);
    Map<String, Object> ctx = Map.of("scene", "live_room", "room_id", 8001);
    Session updated = svc.updateLiveContext(a.getId(), ctx);
    assertThat(updated.getLiveContext()).containsEntry("room_id", 8001);
  }

  @Test
  void illegalTransitionRejected() {
    Session a = svc.getOrCreateCurrent(1L, 100L, "web_h5", null);
    assertThatThrownBy(() -> svc.transition(a.getId(), SessionStatus.IN_AGENT))
        .isInstanceOf(SessionStateMachine.IllegalStateTransitionException.class);
  }
}
