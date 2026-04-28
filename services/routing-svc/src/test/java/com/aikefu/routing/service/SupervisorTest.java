package com.aikefu.routing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashSet;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.aikefu.routing.domain.Agent;
import com.aikefu.routing.domain.AgentRole;
import com.aikefu.routing.domain.AgentStatus;
import com.aikefu.routing.persistence.InMemoryAgentRepository;
import com.aikefu.routing.persistence.InMemoryQueueRepository;

class SupervisorTest {

  private RoutingService svc;

  @BeforeEach
  void setUp() {
    svc = new RoutingService(new InMemoryQueueRepository(), new InMemoryAgentRepository(),
        "vip_first", 60);
    svc.registerOrUpdate(
        Agent.builder()
            .id(1)
            .nickname("alice")
            .skillGroups(new LinkedHashSet<>(Set.of("general")))
            .status(AgentStatus.IDLE)
            .role(AgentRole.AGENT)
            .build());
    svc.registerOrUpdate(
        Agent.builder()
            .id(99)
            .nickname("supervisor")
            .skillGroups(new LinkedHashSet<>(Set.of("general")))
            .status(AgentStatus.IDLE)
            .role(AgentRole.SUPERVISOR)
            .build());
  }

  @Test
  void transferMovesSessionFromAgentToSupervisor() {
    var ent =
        svc.enqueue("ses_1", 1, "general", java.util.Map.of("reason", "user_request"));
    svc.assign(1, ent.getId());
    assertThat(svc.findAgent(1).orElseThrow().getActiveSessionIds()).contains("ses_1");

    svc.transfer(1, 99, "ses_1");
    assertThat(svc.findAgent(1).orElseThrow().getActiveSessionIds()).doesNotContain("ses_1");
    assertThat(svc.findAgent(99).orElseThrow().getActiveSessionIds()).contains("ses_1");
  }

  @Test
  void transferRejectsOfflineTarget() {
    svc.setStatus(99, AgentStatus.OFFLINE);
    assertThatThrownBy(() -> svc.transfer(1, 99, "ses_x"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("offline");
  }

  @Test
  void transferRejectsSelfTarget() {
    assertThatThrownBy(() -> svc.transfer(1, 1, "ses_x"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void observerOnlyForSupervisor() {
    assertThatThrownBy(() -> svc.addObserver(1, "ses_1"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("not SUPERVISOR");
  }

  @Test
  void observerLifecycle() {
    svc.addObserver(99, "ses_a");
    svc.addObserver(99, "ses_b");
    assertThat(svc.observersOf("ses_a")).containsExactly(99L);
    assertThat(svc.findAgent(99).orElseThrow().getObservingSessionIds())
        .contains("ses_a", "ses_b");
    svc.removeObserver(99, "ses_a");
    assertThat(svc.observersOf("ses_a")).isEmpty();
  }

  @Test
  void listSupervisorsExcludesAgents() {
    var sups = svc.listSupervisors();
    assertThat(sups).extracting(Agent::getId).containsExactly(99L);
  }
}
