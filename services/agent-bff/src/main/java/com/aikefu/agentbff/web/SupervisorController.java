package com.aikefu.agentbff.web;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.agentbff.clients.ReportClient;
import com.aikefu.agentbff.service.AgentService;

/**
 * 主管干预端点(T-302)。所有路径要求请求方是主管角色 — 由
 * routing-svc 在 ``observe`` / ``transfer`` 时校验角色,这里仅做请求转发。
 *
 * <p>身份用 ``X-Agent-Id`` 头识别(暂不区分主管 / 坐席的 token,M3 末换 JWT)。
 */
@RestController
@RequestMapping("/v1/supervisor")
public class SupervisorController {

  private final AgentService svc;
  private final ReportClient report;

  public SupervisorController(AgentService svc, ReportClient report) {
    this.svc = svc;
    this.report = report;
  }

  /** 主管侧报表 — 复用 admin 透传的同一组 kind,仅给 dashboard 拼接故障 TopN 用。 */
  @GetMapping("/report/{kind}")
  public Map<String, Object> reportEndpoint(
      @org.springframework.web.bind.annotation.PathVariable("kind") String kind,
      @org.springframework.web.bind.annotation.RequestParam(value = "window_min", defaultValue = "30") int windowMin) {
    return report.report(kind, windowMin, null);
  }

  @GetMapping("/list")
  public List<Map<String, Object>> list() {
    return svc.supervisors();
  }

  /** 实时大屏 — 主管视图直接消费。 */
  @GetMapping("/dashboard")
  public Map<String, Object> dashboard() {
    return svc.dashboard();
  }

  /** 监听 — 把会话加入主管的 observingSessionIds。 */
  @PostMapping("/observe")
  public Map<String, Object> observe(
      @RequestHeader("X-Agent-Id") long supervisorId, @RequestBody Map<String, String> body) {
    return svc.observe(supervisorId, body.get("session_id"));
  }

  @PostMapping("/unobserve")
  public Map<String, Object> unobserve(
      @RequestHeader("X-Agent-Id") long supervisorId, @RequestBody Map<String, String> body) {
    return svc.unobserve(supervisorId, body.get("session_id"));
  }

  /** 插话 — 以 system + sub=supervisor 身份写一条消息。 */
  @PostMapping("/whisper")
  public Map<String, Object> whisper(
      @RequestHeader("X-Agent-Id") long supervisorId, @RequestBody Map<String, String> body) {
    String sid = body.get("session_id");
    String text = body.get("text");
    if (sid == null || sid.isBlank() || text == null || text.isBlank()) {
      return Map.of("ok", false, "error", "session_id 与 text 必填");
    }
    return svc.whisper(supervisorId, sid, text);
  }

  /** 抢接 — 把会话从原坐席手中转给主管。 */
  @PostMapping("/steal")
  public ResponseEntity<Map<String, Object>> steal(
      @RequestHeader("X-Agent-Id") long supervisorId, @RequestBody Map<String, Object> body) {
    String sid = (String) body.get("session_id");
    long fromAgentId = ((Number) body.getOrDefault("from_agent_id", 0)).longValue();
    if (sid == null || sid.isBlank()) return ResponseEntity.badRequest().build();
    return ResponseEntity.ok(svc.steal(supervisorId, fromAgentId, sid));
  }

  /** 通用转接(供普通坐席发起,转给另一个坐席 / 主管)。 */
  @PostMapping("/transfer")
  public ResponseEntity<Map<String, Object>> transfer(
      @RequestHeader("X-Agent-Id") long fromAgentId, @RequestBody Map<String, Object> body) {
    String sid = (String) body.get("session_id");
    long to = ((Number) body.getOrDefault("to_agent_id", 0)).longValue();
    if (sid == null || sid.isBlank() || to <= 0) return ResponseEntity.badRequest().build();
    return ResponseEntity.ok(svc.transfer(fromAgentId, to, sid));
  }
}
