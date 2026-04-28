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
}
