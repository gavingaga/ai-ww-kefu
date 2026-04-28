package com.aikefu.routing.web;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.routing.domain.Agent;
import com.aikefu.routing.domain.AgentStatus;
import com.aikefu.routing.domain.Assignment;
import com.aikefu.routing.domain.QueueEntry;
import com.aikefu.routing.service.RoutingService;
import com.aikefu.routing.web.dto.EnqueueRequest;
import com.aikefu.routing.web.dto.RegisterAgentRequest;
import com.aikefu.routing.web.dto.SetStatusRequest;

@RestController
@RequestMapping("/v1")
public class RoutingController {

  private final RoutingService svc;

  public RoutingController(RoutingService svc) {
    this.svc = svc;
  }

  // ──────────── Queue ────────────

  @PostMapping("/queue/enqueue")
  public ResponseEntity<QueueEntry> enqueue(@RequestBody EnqueueRequest req) {
    if (req == null || req.sessionId() == null || req.sessionId().isBlank()) {
      return ResponseEntity.badRequest().build();
    }
    QueueEntry entry =
        svc.enqueue(
            req.sessionId(),
            req.tenantId() == null ? 1L : req.tenantId(),
            req.skillGroup(),
            req.packet());
    return ResponseEntity.status(HttpStatus.CREATED).body(entry);
  }

  @GetMapping("/queue")
  public List<QueueEntry> list(
      @RequestParam(value = "skill_group", required = false) String skillGroup) {
    return svc.listQueue(skillGroup);
  }

  @GetMapping("/queue/{entryId}/position")
  public Map<String, Object> position(@PathVariable("entryId") String entryId) {
    return Map.of("entry_id", entryId, "position", svc.positionOf(entryId));
  }

  @GetMapping("/stats")
  public Map<String, Object> stats() {
    return svc.stats();
  }

  /** 实时大屏聚合(主管视图直接消费)。 */
  @GetMapping("/dashboard")
  public Map<String, Object> dashboard() {
    return svc.dashboard();
  }

  // ──────────── Agents ────────────

  @PostMapping("/agents")
  public Agent register(@RequestBody RegisterAgentRequest req) {
    return svc.registerOrUpdate(
        Agent.builder()
            .id(req.id())
            .nickname(req.nickname())
            .avatarUrl(req.avatarUrl())
            .skillGroups(
                req.skillGroups() == null ? new LinkedHashSet<>() : new LinkedHashSet<>(req.skillGroups()))
            .maxConcurrency(req.maxConcurrency() == null ? 5 : req.maxConcurrency())
            .status(req.status() == null ? AgentStatus.OFFLINE : req.status())
            .role(req.role() == null ? com.aikefu.routing.domain.AgentRole.AGENT : req.role())
            .build());
  }

  @GetMapping("/agents")
  public List<Agent> agents() {
    return svc.listAgents();
  }

  @GetMapping("/agents/{id}")
  public ResponseEntity<Agent> agent(@PathVariable long id) {
    return svc.findAgent(id).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
  }

  @PostMapping("/agents/{id}/status")
  public Agent setStatus(@PathVariable long id, @RequestBody SetStatusRequest req) {
    return svc.setStatus(id, req.status());
  }

  // ──────────── 派单 ────────────

  @PostMapping("/agents/{id}/peek")
  public ResponseEntity<QueueEntry> peek(@PathVariable long id) {
    Optional<QueueEntry> e = svc.peekFor(id);
    return e.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping("/agents/{id}/assign")
  public ResponseEntity<Assignment> assign(
      @PathVariable long id, @RequestBody Map<String, String> body) {
    String entryId = body == null ? null : body.get("entry_id");
    if (entryId == null || entryId.isBlank()) return ResponseEntity.badRequest().build();
    return svc.assign(id, entryId)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.status(HttpStatus.CONFLICT).build());
  }

  @PostMapping("/sessions/{sessionId}/release")
  public ResponseEntity<Void> release(
      @PathVariable("sessionId") String sessionId, @RequestParam("agent_id") long agentId) {
    svc.release(agentId, sessionId);
    return ResponseEntity.noContent().build();
  }

  // ──────────── 主管干预(T-302) ────────────

  /** 抢接 / 转接。{@code from_agent_id} 不持有该会话也允许。 */
  @PostMapping("/sessions/{sessionId}/transfer")
  public ResponseEntity<Map<String, Object>> transfer(
      @PathVariable("sessionId") String sessionId, @RequestBody Map<String, Object> body) {
    long from = ((Number) body.getOrDefault("from_agent_id", 0)).longValue();
    long to = ((Number) body.getOrDefault("to_agent_id", 0)).longValue();
    if (to <= 0) return ResponseEntity.badRequest().build();
    var assignment = svc.transfer(from, to, sessionId);
    return ResponseEntity.ok(
        Map.of(
            "ok", true,
            "session_id", assignment.getSessionId(),
            "from_agent_id", from,
            "to_agent_id", to,
            "assigned_at", assignment.getAssignedAt()));
  }

  @PostMapping("/supervisors/{id}/observe")
  public ResponseEntity<Map<String, Object>> observe(
      @PathVariable("id") long supervisorId, @RequestBody Map<String, String> body) {
    String sid = body == null ? null : body.get("session_id");
    if (sid == null || sid.isBlank()) return ResponseEntity.badRequest().build();
    svc.addObserver(supervisorId, sid);
    return ResponseEntity.ok(Map.of("ok", true, "session_id", sid));
  }

  @PostMapping("/supervisors/{id}/unobserve")
  public ResponseEntity<Map<String, Object>> unobserve(
      @PathVariable("id") long supervisorId, @RequestBody Map<String, String> body) {
    String sid = body == null ? null : body.get("session_id");
    if (sid == null || sid.isBlank()) return ResponseEntity.badRequest().build();
    svc.removeObserver(supervisorId, sid);
    return ResponseEntity.ok(Map.of("ok", true, "session_id", sid));
  }

  @GetMapping("/sessions/{sessionId}/observers")
  public Map<String, Object> observers(@PathVariable("sessionId") String sessionId) {
    return Map.of("session_id", sessionId, "observers", svc.observersOf(sessionId));
  }

  /** 反查会话相关坐席:active(承接的)+ observers(观察的主管)。 */
  @GetMapping("/sessions/{sessionId}/agents")
  public Map<String, Object> sessionAgents(@PathVariable("sessionId") String sessionId) {
    return Map.of(
        "session_id", sessionId,
        "active", svc.activeAgentsOf(sessionId),
        "observers", svc.observersOf(sessionId));
  }

  @GetMapping("/supervisors")
  public List<Agent> supervisors() {
    return svc.listSupervisors();
  }
}
