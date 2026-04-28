package com.aikefu.routing.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.aikefu.routing.domain.Agent;
import com.aikefu.routing.domain.AgentStatus;
import com.aikefu.routing.domain.QueueEntry;
import com.aikefu.routing.persistence.InMemoryAgentRepository;
import com.aikefu.routing.persistence.InMemoryQueueRepository;

class RoutingServiceTest {

  private RoutingService svc;
  private InMemoryAgentRepository agents;
  private InMemoryQueueRepository queue;

  @BeforeEach
  void setUp() {
    agents = new InMemoryAgentRepository();
    queue = new InMemoryQueueRepository();
    svc = new RoutingService(queue, agents, "vip_first", 60);
  }

  private Map<String, Object> packet(String reason, String level) {
    return Map.of(
        "reason", reason,
        "user", Map.of("level", level),
        "summary", "test");
  }

  @Test
  void enqueueAssignsPriorityAndGroupFromHint() {
    var p = packet("user_request", "VIP3");
    p = new java.util.HashMap<>(p);
    p.put("skill_group_hint", "play_tech");
    var entry = svc.enqueue("ses_1", 1, null, p);
    assertThat(entry.getSkillGroup()).isEqualTo("play_tech");
    assertThat(entry.getPriority()).isEqualTo(50);
    assertThat(entry.isVip()).isTrue();
  }

  @Test
  void minorCompliancePriorityHighest() {
    var entry = svc.enqueue("ses_m", 1, "minor_compliance", packet("minor_compliance", "free"));
    assertThat(entry.getPriority()).isEqualTo(10);
  }

  @Test
  void peekRespectsAgentSkillGroupAndStatus() {
    svc.registerOrUpdate(
        Agent.builder()
            .id(1)
            .nickname("alice")
            .skillGroups(new java.util.LinkedHashSet<>(Set.of("play_tech")))
            .status(AgentStatus.IDLE)
            .build());
    svc.enqueue("s1", 1, "general", packet("user_request", "free"));
    svc.enqueue("s2", 1, "play_tech", packet("user_request", "free"));
    var pick = svc.peekFor(1).orElseThrow();
    assertThat(pick.getSessionId()).isEqualTo("s2");
  }

  @Test
  void offlineAgentCannotPick() {
    svc.registerOrUpdate(
        Agent.builder()
            .id(1)
            .skillGroups(new java.util.LinkedHashSet<>(Set.of("general")))
            .status(AgentStatus.OFFLINE)
            .build());
    svc.enqueue("s1", 1, "general", packet("user_request", "free"));
    assertThat(svc.peekFor(1)).isEmpty();
  }

  @Test
  void vipFirstStrategyPicksVipBeforeFifo() {
    svc.registerOrUpdate(
        Agent.builder()
            .id(1)
            .skillGroups(new java.util.LinkedHashSet<>(Set.of("general")))
            .status(AgentStatus.IDLE)
            .build());
    svc.enqueue("free_first", 1, "general", packet("user_request", "free"));
    // 让 VIP 后入队仍优先
    try {
      Thread.sleep(2);
    } catch (InterruptedException ignored) {
    }
    svc.enqueue("vip_later", 1, "general", packet("user_request", "VIP3"));
    QueueEntry pick = svc.peekFor(1).orElseThrow();
    assertThat(pick.getSessionId()).isEqualTo("vip_later");
  }

  @Test
  void assignMovesEntryAndUpdatesAgent() {
    svc.registerOrUpdate(
        Agent.builder()
            .id(1)
            .skillGroups(new java.util.LinkedHashSet<>(Set.of("general")))
            .status(AgentStatus.IDLE)
            .maxConcurrency(2)
            .build());
    var e = svc.enqueue("s1", 1, "general", packet("user_request", "free"));
    var a = svc.assign(1, e.getId()).orElseThrow();
    assertThat(a.getSessionId()).isEqualTo("s1");
    assertThat(svc.findAgent(1).orElseThrow().getActiveSessionIds()).contains("s1");
    assertThat(svc.listQueue("general")).isEmpty();
  }

  @Test
  void assignFlipsToBusyWhenReachingMaxConcurrency() {
    svc.registerOrUpdate(
        Agent.builder()
            .id(1)
            .skillGroups(new java.util.LinkedHashSet<>(Set.of("general")))
            .status(AgentStatus.IDLE)
            .maxConcurrency(1)
            .build());
    var e = svc.enqueue("s1", 1, "general", packet("user_request", "free"));
    svc.assign(1, e.getId());
    assertThat(svc.findAgent(1).orElseThrow().getStatus()).isEqualTo(AgentStatus.BUSY);
  }

  @Test
  void releaseRestoresIdleFromBusy() {
    svc.registerOrUpdate(
        Agent.builder()
            .id(1)
            .skillGroups(new java.util.LinkedHashSet<>(Set.of("general")))
            .status(AgentStatus.IDLE)
            .maxConcurrency(1)
            .build());
    var e = svc.enqueue("s1", 1, "general", packet("user_request", "free"));
    svc.assign(1, e.getId());
    svc.release(1, "s1");
    assertThat(svc.findAgent(1).orElseThrow().getStatus()).isEqualTo(AgentStatus.IDLE);
    assertThat(svc.findAgent(1).orElseThrow().getActiveSessionIds()).doesNotContain("s1");
  }

  @Test
  void positionReturns1ForHead() {
    svc.enqueue("s1", 1, "general", packet("user_request", "free"));
    var e2 = svc.enqueue("s2", 1, "general", packet("user_request", "free"));
    int pos = svc.positionOf(e2.getId());
    assertThat(pos).isEqualTo(2);
  }

  @Test
  void overflowMovesEntryWhenAged() throws Exception {
    var s = new RoutingService(queue, agents, "fifo", 30);
    var e = s.enqueue("s1", 1, "play_tech", packet("user_request", "free"));
    // 手动把 enqueuedAt 推早 60s,触发溢出
    e.setEnqueuedAt(java.time.Instant.now().minusSeconds(120));
    Set<String> moved = s.overflowOnce(Map.of("play_tech", "general"));
    assertThat(moved).contains(e.getId());
    List<QueueEntry> general = queue.list("general");
    assertThat(general).extracting(QueueEntry::getSessionId).contains("s1");
  }
}
