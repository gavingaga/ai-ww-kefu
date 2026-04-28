package com.aikefu.routing.service;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.aikefu.routing.domain.Agent;
import com.aikefu.routing.domain.AgentStatus;
import com.aikefu.routing.domain.Assignment;
import com.aikefu.routing.domain.QueueEntry;
import com.aikefu.routing.persistence.AgentRepository;
import com.aikefu.routing.persistence.QueueRepository;

/** 排队 + 分配。M2 起步内存实现,M3 末接 Redis Sorted Set / Stream。 */
@Service
public class RoutingService {

  private static final String DEFAULT_FALLBACK_GROUP = "general";

  private final QueueRepository queue;
  private final AgentRepository agents;
  private AssignmentStrategy strategy;
  private final Duration overflowThreshold;

  public RoutingService(
      QueueRepository queue,
      AgentRepository agents,
      @Value("${aikefu.routing.strategy:vip_first}") String strategyName,
      @Value("${aikefu.routing.queue-overflow-seconds:180}") int overflowSeconds) {
    this.queue = queue;
    this.agents = agents;
    this.strategy = AssignmentStrategy.of(strategyName);
    this.overflowThreshold = Duration.ofSeconds(Math.max(overflowSeconds, 30));
  }

  // ──────────── 入队 ────────────

  public QueueEntry enqueue(
      String sessionId,
      long tenantId,
      String skillGroup,
      Map<String, Object> packet) {
    if (sessionId == null || sessionId.isBlank()) {
      throw new IllegalArgumentException("sessionId required");
    }
    String group = normalizeGroup(skillGroup, packet);
    QueueEntry entry =
        QueueEntry.builder()
            .id("q_" + UUID.randomUUID().toString().replace("-", ""))
            .sessionId(sessionId)
            .tenantId(tenantId)
            .skillGroup(group)
            .packet(packet == null ? new HashMap<>() : packet)
            .enqueuedAt(Instant.now())
            .priority(priorityFor(packet))
            .build();
    queue.enqueue(entry);
    return entry;
  }

  private String normalizeGroup(String group, Map<String, Object> packet) {
    if (group != null && !group.isBlank()) return group;
    if (packet != null) {
      Object hint = packet.get("skill_group_hint");
      if (hint != null && !hint.toString().isBlank()) return hint.toString();
    }
    return DEFAULT_FALLBACK_GROUP;
  }

  private int priorityFor(Map<String, Object> packet) {
    if (packet == null) return 100;
    Object reason = packet.get("reason");
    if ("minor_compliance".equals(reason)) return 10;
    if ("report_compliance".equals(reason)) return 30;
    if ("user_request".equals(reason)) return 50;
    return 100;
  }

  // ──────────── 派单 ────────────

  /** 坐席声明可接,返回最优候选条目(尚未 assign,需调 {@link #assign})。 */
  public Optional<QueueEntry> peekFor(long agentId) {
    Agent agent = agents.findById(agentId).orElse(null);
    if (agent == null || !agent.canTakeMore()) return Optional.empty();
    if (agent.getSkillGroups() == null || agent.getSkillGroups().isEmpty()) return Optional.empty();
    List<QueueEntry> all = new java.util.ArrayList<>();
    for (String g : agent.getSkillGroups()) {
      all.addAll(queue.list(g));
    }
    if (all.isEmpty()) return Optional.empty();
    return strategy.pickForAgent(agent, all);
  }

  /** 把 entry 派给 agent,失败返回 empty(竞态被抢 / 状态变化等)。 */
  public synchronized Optional<Assignment> assign(long agentId, String entryId) {
    Agent agent = agents.findById(agentId).orElse(null);
    if (agent == null || !agent.canTakeMore()) return Optional.empty();
    Optional<QueueEntry> opt = queue.remove(entryId);
    if (opt.isEmpty()) return Optional.empty();
    QueueEntry entry = opt.get();
    if (agent.getActiveSessionIds() == null) {
      agent.setActiveSessionIds(new LinkedHashSet<>());
    }
    agent.getActiveSessionIds().add(entry.getSessionId());
    if (agent.getActiveSessionIds().size() >= agent.getMaxConcurrency()) {
      agent.setStatus(AgentStatus.BUSY);
      agent.setStatusChangedAt(Instant.now());
    }
    agents.save(agent);
    return Optional.of(
        Assignment.builder()
            .entryId(entry.getId())
            .sessionId(entry.getSessionId())
            .agentId(agentId)
            .skillGroup(entry.getSkillGroup())
            .assignedAt(Instant.now())
            .build());
  }

  /** 坐席结束会话,从 active 中移除;若被压满 BUSY 之前的状态需要恢复。 */
  public synchronized void release(long agentId, String sessionId) {
    Agent agent = agents.findById(agentId).orElse(null);
    if (agent == null) return;
    if (agent.getActiveSessionIds() == null) {
      agent.setActiveSessionIds(new LinkedHashSet<>());
    }
    agent.getActiveSessionIds().remove(sessionId);
    if (agent.getStatus() == AgentStatus.BUSY) {
      agent.setStatus(AgentStatus.IDLE);
      agent.setStatusChangedAt(Instant.now());
    }
    agents.save(agent);
  }

  // ──────────── 主管干预(T-302) ────────────

  /** 抢接 / 转接:把会话从 fromAgent 手中转给 toAgent;原坐席不持有也能 attach。 */
  public synchronized Assignment transfer(long fromAgentId, long toAgentId, String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      throw new IllegalArgumentException("sessionId required");
    }
    if (fromAgentId == toAgentId) {
      throw new IllegalArgumentException("from == to");
    }
    Agent to = agents.findById(toAgentId).orElseThrow(() -> new AgentNotFound(toAgentId));
    if (to.getStatus() == com.aikefu.routing.domain.AgentStatus.OFFLINE) {
      throw new IllegalStateException("target agent offline");
    }
    Agent from = agents.findById(fromAgentId).orElse(null);
    if (from != null && from.getActiveSessionIds() != null) {
      from.getActiveSessionIds().remove(sessionId);
      if (from.getStatus() == com.aikefu.routing.domain.AgentStatus.BUSY
          && from.getActiveSessionIds().size() < from.getMaxConcurrency()) {
        from.setStatus(com.aikefu.routing.domain.AgentStatus.IDLE);
        from.setStatusChangedAt(Instant.now());
      }
      agents.save(from);
    }
    if (to.getActiveSessionIds() == null) {
      to.setActiveSessionIds(new LinkedHashSet<>());
    }
    to.getActiveSessionIds().add(sessionId);
    if (to.getActiveSessionIds().size() >= to.getMaxConcurrency()) {
      to.setStatus(com.aikefu.routing.domain.AgentStatus.BUSY);
      to.setStatusChangedAt(Instant.now());
    }
    agents.save(to);
    return Assignment.builder()
        .entryId("transfer_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
        .sessionId(sessionId)
        .agentId(toAgentId)
        .skillGroup("transfer")
        .assignedAt(Instant.now())
        .build();
  }

  /** 主管开始观察会话。仅 SUPERVISOR 角色可调用。 */
  public synchronized void addObserver(long supervisorId, String sessionId) {
    Agent sup = agents.findById(supervisorId).orElseThrow(() -> new AgentNotFound(supervisorId));
    if (sup.getRole() != com.aikefu.routing.domain.AgentRole.SUPERVISOR) {
      throw new IllegalStateException("agent " + supervisorId + " is not SUPERVISOR");
    }
    if (sup.getObservingSessionIds() == null) {
      sup.setObservingSessionIds(new LinkedHashSet<>());
    }
    sup.getObservingSessionIds().add(sessionId);
    agents.save(sup);
  }

  public synchronized void removeObserver(long supervisorId, String sessionId) {
    Agent sup = agents.findById(supervisorId).orElse(null);
    if (sup == null || sup.getObservingSessionIds() == null) return;
    sup.getObservingSessionIds().remove(sessionId);
    agents.save(sup);
  }

  /** 列出当前观察该会话的主管 ID 集合(用于 BFF 推送插话权限校验)。 */
  public java.util.Set<Long> observersOf(String sessionId) {
    java.util.Set<Long> out = new LinkedHashSet<>();
    for (Agent a : agents.all()) {
      if (a.getRole() == com.aikefu.routing.domain.AgentRole.SUPERVISOR
          && a.getObservingSessionIds() != null
          && a.getObservingSessionIds().contains(sessionId)) {
        out.add(a.getId());
      }
    }
    return out;
  }

  /** 列出当前承接(active)该会话的坐席 ID — 通常 ≤ 1 个;无则返回空集合。 */
  public java.util.Set<Long> activeAgentsOf(String sessionId) {
    java.util.Set<Long> out = new LinkedHashSet<>();
    if (sessionId == null || sessionId.isBlank()) return out;
    for (Agent a : agents.all()) {
      if (a.getActiveSessionIds() != null && a.getActiveSessionIds().contains(sessionId)) {
        out.add(a.getId());
      }
    }
    return out;
  }

  public List<Agent> listSupervisors() {
    return agents.all().stream()
        .filter(a -> a.getRole() == com.aikefu.routing.domain.AgentRole.SUPERVISOR)
        .toList();
  }

  // ──────────── 坐席管理 ────────────

  public Agent registerOrUpdate(Agent agent) {
    Agent existing = agents.findById(agent.getId()).orElse(null);
    if (existing != null) {
      existing.setNickname(agent.getNickname());
      existing.setAvatarUrl(agent.getAvatarUrl());
      if (agent.getSkillGroups() != null) {
        existing.setSkillGroups(new LinkedHashSet<>(agent.getSkillGroups()));
      }
      if (agent.getMaxConcurrency() > 0) existing.setMaxConcurrency(agent.getMaxConcurrency());
      if (agent.getRole() != null) existing.setRole(agent.getRole());
      return agents.save(existing);
    }
    if (agent.getActiveSessionIds() == null) {
      agent.setActiveSessionIds(new LinkedHashSet<>());
    }
    if (agent.getObservingSessionIds() == null) {
      agent.setObservingSessionIds(new LinkedHashSet<>());
    }
    if (agent.getSkillGroups() == null) {
      agent.setSkillGroups(new LinkedHashSet<>());
    }
    if (agent.getStatus() == null) {
      agent.setStatus(AgentStatus.OFFLINE);
    }
    if (agent.getRole() == null) {
      agent.setRole(com.aikefu.routing.domain.AgentRole.AGENT);
    }
    if (agent.getMaxConcurrency() <= 0) {
      agent.setMaxConcurrency(5);
    }
    agent.setStatusChangedAt(Instant.now());
    return agents.save(agent);
  }

  public synchronized Agent setStatus(long agentId, AgentStatus status) {
    Agent agent = agents.findById(agentId).orElseThrow(() -> new AgentNotFound(agentId));
    agent.setStatus(status);
    agent.setStatusChangedAt(Instant.now());
    return agents.save(agent);
  }

  public List<Agent> listAgents() {
    return agents.all();
  }

  public Optional<Agent> findAgent(long id) {
    return agents.findById(id);
  }

  // ──────────── 查询 ────────────

  public List<QueueEntry> listQueue(String skillGroup) {
    if (skillGroup == null || skillGroup.isBlank()) return queue.listAll();
    return queue.list(skillGroup);
  }

  /** 估算该 entry 的等待位置(从 1 开始)。 */
  public int positionOf(String entryId) {
    QueueEntry e = queue.findById(entryId).orElse(null);
    if (e == null) return 0;
    List<QueueEntry> list = queue.list(e.getSkillGroup());
    int i = 0;
    for (QueueEntry q : list) {
      i++;
      if (q.getId().equals(entryId)) return i;
    }
    return 0;
  }

  public Map<String, Object> stats() {
    Map<String, Integer> queueByGroup = new HashMap<>();
    for (QueueEntry e : queue.listAll()) {
      queueByGroup.merge(e.getSkillGroup(), 1, Integer::sum);
    }
    int idle = 0, busy = 0, away = 0, offline = 0;
    for (Agent a : agents.all()) {
      switch (a.getStatus()) {
        case IDLE -> idle++;
        case BUSY -> busy++;
        case AWAY -> away++;
        default -> offline++;
      }
    }
    return Map.of(
        "queue", queueByGroup,
        "agents",
            Map.of("idle", idle, "busy", busy, "away", away, "offline", offline,
                "total", agents.all().size()),
        "strategy", strategy.name(),
        "overflow_threshold_seconds", (int) overflowThreshold.getSeconds());
  }

  /**
   * 实时大屏聚合数据 — 比 {@link #stats} 更细粒度,供主管视图直接消费。
   *
   * 包含:KPI(总队列 / VIP / 老化 / 未成年 / 最大等待 / 坐席状态分布 / load_ratio)+
   * 队列分布(by group)+ 坐席列表 + 全量队列条目(带等待秒数)。
   */
  public Map<String, Object> dashboard() {
    java.util.List<QueueEntry> all = queue.listAll();
    Map<String, Integer> queueByGroup = new HashMap<>();
    int vipCount = 0;
    int agedCount = 0;
    int minorCount = 0;
    Instant now = Instant.now();
    long overflowSec = overflowThreshold.getSeconds();
    long maxWaitSec = 0;
    for (QueueEntry e : all) {
      queueByGroup.merge(e.getSkillGroup(), 1, Integer::sum);
      if (e.isVip()) vipCount++;
      if ("minor_compliance".equals(String.valueOf(e.reason()))) minorCount++;
      if (e.getEnqueuedAt() != null) {
        long waited = java.time.Duration.between(e.getEnqueuedAt(), now).getSeconds();
        if (waited >= overflowSec) agedCount++;
        if (waited > maxWaitSec) maxWaitSec = waited;
      }
    }
    int idle = 0, busy = 0, away = 0, offline = 0, supervisors = 0;
    int totalLoad = 0, totalCap = 0;
    java.util.List<Map<String, Object>> agentRows = new java.util.ArrayList<>();
    for (Agent a : agents.all()) {
      switch (a.getStatus()) {
        case IDLE -> idle++;
        case BUSY -> busy++;
        case AWAY -> away++;
        default -> offline++;
      }
      if (a.getRole() == com.aikefu.routing.domain.AgentRole.SUPERVISOR) supervisors++;
      int load = a.load();
      totalLoad += load;
      if (a.getStatus() != com.aikefu.routing.domain.AgentStatus.OFFLINE) {
        totalCap += a.getMaxConcurrency();
      }
      Map<String, Object> row = new java.util.LinkedHashMap<>();
      row.put("id", a.getId());
      row.put("nickname", a.getNickname() == null ? ("#" + a.getId()) : a.getNickname());
      row.put("status", a.getStatus().name());
      row.put("role", a.getRole() == null ? "AGENT" : a.getRole().name());
      row.put(
          "skill_groups", a.getSkillGroups() == null ? List.of() : a.getSkillGroups());
      row.put("load", load);
      row.put("max_concurrency", a.getMaxConcurrency());
      row.put(
          "active_session_ids",
          a.getActiveSessionIds() == null ? List.of() : a.getActiveSessionIds());
      row.put(
          "observing_session_ids",
          a.getObservingSessionIds() == null ? List.of() : a.getObservingSessionIds());
      agentRows.add(row);
    }

    java.util.List<Map<String, Object>> queueRows = new java.util.ArrayList<>();
    for (QueueEntry e : all) {
      Map<String, Object> p = e.getPacket() == null ? Map.of() : e.getPacket();
      Map<String, Object> row = new java.util.LinkedHashMap<>();
      row.put("id", e.getId());
      row.put("session_id", e.getSessionId());
      row.put("skill_group", e.getSkillGroup());
      row.put("priority", e.getPriority());
      row.put("vip", e.isVip());
      row.put("reason", String.valueOf(p.get("reason")));
      row.put("summary", String.valueOf(p.getOrDefault("summary", "")));
      row.put("enqueued_at", String.valueOf(e.getEnqueuedAt()));
      row.put(
          "waited_seconds",
          e.getEnqueuedAt() == null
              ? 0
              : java.time.Duration.between(e.getEnqueuedAt(), now).getSeconds());
      row.put("overflowed", e.isOverflowed());
      queueRows.add(row);
    }

    Map<String, Object> kpi = new java.util.LinkedHashMap<>();
    kpi.put("queue_total", all.size());
    kpi.put("vip_waiting", vipCount);
    kpi.put("aged_waiting", agedCount);
    kpi.put("minor_waiting", minorCount);
    kpi.put("max_wait_seconds", maxWaitSec);
    kpi.put("agents_idle", idle);
    kpi.put("agents_busy", busy);
    kpi.put("agents_away", away);
    kpi.put("agents_offline", offline);
    kpi.put("supervisors", supervisors);
    kpi.put("load", totalLoad);
    kpi.put("capacity", totalCap);
    kpi.put(
        "load_ratio",
        totalCap == 0 ? 0.0 : Math.round(((double) totalLoad / totalCap) * 1000.0) / 1000.0);
    kpi.put("strategy", strategy.name());

    Map<String, Object> out = new java.util.LinkedHashMap<>();
    out.put("kpi", kpi);
    out.put("queue_by_group", queueByGroup);
    out.put("agents", agentRows);
    out.put("queue", queueRows);
    return out;
  }

  // ──────────── 溢出 ────────────

  /**
   * 把超时未派的条目移到上级 group。groupOverflow 由 web 配置传入(group → fallback group)。
   *
   * @return 实际溢出的 entry id 集合
   */
  public synchronized java.util.Set<String> overflowOnce(Map<String, String> groupOverflow) {
    java.util.Set<String> moved = new HashSet<>();
    if (groupOverflow == null || groupOverflow.isEmpty()) return moved;
    for (QueueEntry entry : queue.listAll()) {
      if (!AssignmentStrategy.shouldOverflow(entry, overflowThreshold)) continue;
      String to = groupOverflow.getOrDefault(entry.getSkillGroup(), "");
      if (to == null || to.isBlank() || to.equals(entry.getSkillGroup())) continue;
      queue.move(entry.getId(), to);
      moved.add(entry.getId());
    }
    return moved;
  }

  // 为单测注入策略
  void overrideStrategy(AssignmentStrategy s) {
    this.strategy = s;
  }

  public static class AgentNotFound extends RuntimeException {
    public AgentNotFound(long id) {
      super("agent not found: " + id);
    }
  }
}
