package com.aikefu.agentbff.web;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.agentbff.service.AgentService;

/** 座席 BFF — 路径前缀 /v1/agent。M2 起步用 X-Agent-Id 头识别坐席,M3 末换 JWT。 */
@RestController
@RequestMapping("/v1/agent")
public class AgentController {

  private final AgentService svc;

  public AgentController(AgentService svc) {
    this.svc = svc;
  }

  @GetMapping("/healthz")
  public Map<String, String> healthz() {
    return Map.of("status", "ok");
  }

  /** 收件箱 — waiting + active 一起拉。 */
  @GetMapping("/inbox")
  public Map<String, Object> inbox(@RequestHeader("X-Agent-Id") long agentId) {
    return svc.inbox(agentId);
  }

  @PostMapping("/peek")
  public ResponseEntity<Map<String, Object>> peek(@RequestHeader("X-Agent-Id") long agentId) {
    Map<String, Object> e = svc.peek(agentId);
    if (e == null || e.isEmpty()) return ResponseEntity.noContent().build();
    return ResponseEntity.ok(e);
  }

  @PostMapping("/sessions/accept")
  public ResponseEntity<Map<String, Object>> accept(
      @RequestHeader("X-Agent-Id") long agentId, @RequestBody Map<String, String> body) {
    String entryId = body == null ? null : body.get("entry_id");
    if (entryId == null || entryId.isBlank()) return ResponseEntity.badRequest().build();
    Map<String, Object> res = svc.accept(agentId, entryId);
    return res == null
        ? ResponseEntity.status(HttpStatus.CONFLICT).build()
        : ResponseEntity.ok(res);
  }

  @PostMapping("/sessions/{id}/close")
  public Map<String, Object> close(
      @RequestHeader("X-Agent-Id") long agentId, @PathVariable("id") String sessionId) {
    return svc.close(agentId, sessionId);
  }

  @PostMapping("/sessions/{id}/transfer")
  public Map<String, Object> transferToAi(
      @RequestHeader("X-Agent-Id") long agentId, @PathVariable("id") String sessionId) {
    return svc.transferToAi(agentId, sessionId);
  }

  @PostMapping("/status")
  public Map<String, Object> setStatus(
      @RequestHeader("X-Agent-Id") long agentId, @RequestBody Map<String, String> body) {
    return svc.setStatus(agentId, body == null ? "IDLE" : body.getOrDefault("status", "IDLE"));
  }

  @PostMapping("/register")
  public Map<String, Object> register(@RequestBody Map<String, Object> body) {
    return svc.registerOrUpdate(body);
  }

  @GetMapping("/sessions/{id}/messages")
  public Map<String, Object> messages(
      @PathVariable("id") String sessionId,
      @RequestParam(value = "before", defaultValue = "0") long before,
      @RequestParam(value = "limit", defaultValue = "30") int limit) {
    return svc.messages(sessionId, before, limit);
  }

  @PostMapping("/sessions/{id}/messages")
  public Map<String, Object> reply(
      @RequestHeader("X-Agent-Id") long agentId,
      @PathVariable("id") String sessionId,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody Map<String, Object> body) {
    Map<String, Object> req = new java.util.LinkedHashMap<>(body == null ? Map.of() : body);
    req.put("role", "agent");
    req.putIfAbsent("type", "text");
    req.put("aiMeta", Map.of("agent_id", agentId));
    return svc.sendMessage(sessionId, idempotencyKey, req);
  }
}
