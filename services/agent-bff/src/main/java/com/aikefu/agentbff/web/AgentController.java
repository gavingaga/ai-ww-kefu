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
  private final com.aikefu.agentbff.clients.ToolClient toolClient;

  public AgentController(AgentService svc, com.aikefu.agentbff.clients.ToolClient toolClient) {
    this.svc = svc;
    this.toolClient = toolClient;
  }

  /** 坐席侧调工具(get_membership / get_play_diagnostics 等):透传 tool-svc。 */
  @org.springframework.web.bind.annotation.PostMapping("/tools/{name}/invoke")
  public Map<String, Object> invokeTool(
      @org.springframework.web.bind.annotation.PathVariable("name") String name,
      @org.springframework.web.bind.annotation.RequestBody Map<String, Object> body) {
    return toolClient.invoke(name, body);
  }

  /** AI 建议回复 — 给坐席 1~3 条候选;由 AgentService 拼历史 + 转 ai-hub /v1/ai/suggest。 */
  @org.springframework.web.bind.annotation.PostMapping("/sessions/{id}/suggest")
  public Map<String, Object> suggestReplies(
      @org.springframework.web.bind.annotation.PathVariable("id") String sessionId,
      @org.springframework.web.bind.annotation.RequestBody(required = false) Map<String, Object> body) {
    return svc.suggestReplies(sessionId, body == null ? java.util.Map.of() : body);
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

  /** AI 托管中的会话列表(坐席台「AI 托管中」板块):默认 status=ai。 */
  @GetMapping("/ai-sessions")
  public java.util.List<Map<String, Object>> aiSessions(
      @org.springframework.web.bind.annotation.RequestParam(value = "status", defaultValue = "ai")
          String status,
      @org.springframework.web.bind.annotation.RequestParam(value = "limit", defaultValue = "100")
          int limit) {
    return svc.listSessionsByStatus(status, limit);
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
    return svc.sendMessage(sessionId, idempotencyKey, req, agentId);
  }
}
