package com.aikefu.session.web;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.session.domain.Session;
import com.aikefu.session.domain.SessionStatus;
import com.aikefu.session.service.SessionService;
import com.aikefu.session.web.dto.HandoffResponse;
import com.aikefu.session.web.dto.LiveContextRequest;

/** 会话相关 REST。仅暴露 BFF / 网关使用,生产环境须走 mTLS + 服务账号。 */
@RestController
@RequestMapping("/v1")
public class SessionController {

  private final SessionService sessionService;

  public SessionController(SessionService sessionService) {
    this.sessionService = sessionService;
  }

  /** 按 status 过滤会话(给坐席台「AI 托管会话」板块用)。 */
  @GetMapping("/sessions")
  public java.util.List<Session> list(
      @RequestParam(value = "status", required = false) String status,
      @RequestParam(value = "limit", defaultValue = "100") int limit) {
    return sessionService.listByStatus(status, limit);
  }

  /** 取或开当前会话。 */
  @GetMapping("/sessions/current")
  public Session current(
      @RequestParam("tenant_id") long tenantId,
      @RequestParam("user_id") long userId,
      @RequestParam(value = "channel", required = false) String channel) {
    return sessionService.getOrCreateCurrent(tenantId, userId, channel, null);
  }

  @GetMapping("/sessions/{id}")
  public Session get(@PathVariable("id") String id) {
    return sessionService.getById(id);
  }

  /** 主动转人工 — AI → QUEUEING。 */
  @PostMapping("/sessions/{id}/handoff")
  public ResponseEntity<HandoffResponse> handoff(@PathVariable("id") String id) {
    Session s = sessionService.transition(id, SessionStatus.QUEUEING);
    HandoffResponse body = new HandoffResponse(s.getId(), 0, 30);
    return ResponseEntity.status(HttpStatus.ACCEPTED).body(body);
  }

  /** 结束会话 — 任意状态 → CLOSED(若已是 CLOSED 则 204 幂等)。 */
  @PostMapping("/sessions/{id}/close")
  public ResponseEntity<Void> close(@PathVariable("id") String id) {
    sessionService.transition(id, SessionStatus.CLOSED);
    return ResponseEntity.noContent().build();
  }

  /**
   * 接管会话(steal / transfer 走的同一入口)— 状态切到 IN_AGENT 并绑定坐席。
   *
   * <p>body: {@code {"agent_id": <long>, "skill_group_id": <long?>}}。
   * 与 {@code handoff} 的区别是直跃 IN_AGENT 跳过排队 — 适合主管 steal 或定向 transfer。
   */
  @PostMapping("/sessions/{id}/assign")
  public Session assign(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
    long agentId = ((Number) body.getOrDefault("agent_id", 0L)).longValue();
    long skillGroupId = ((Number) body.getOrDefault("skill_group_id", 0L)).longValue();
    sessionService.transition(id, SessionStatus.IN_AGENT);
    return sessionService.attachAgent(id, agentId, skillGroupId);
  }

  /** 把 IN_AGENT 会话回托管给 AI(坐席「转回 AI」按钮),IN_AGENT → AI 状态机已允许。 */
  @PostMapping("/sessions/{id}/release-to-ai")
  public Session releaseToAi(@PathVariable("id") String id) {
    return sessionService.transition(id, SessionStatus.AI);
  }

  /** 更新 live_context(切清晰度 / 卡顿 / 换房间 触发)。 */
  @PostMapping("/sessions/{id}/live-context")
  public ResponseEntity<Void> updateLiveContext(
      @PathVariable("id") String id, @RequestBody LiveContextRequest req) {
    Map<String, Object> ctx = req == null ? Map.of() : req.toMap();
    sessionService.updateLiveContext(id, ctx);
    return ResponseEntity.noContent().build();
  }
}
