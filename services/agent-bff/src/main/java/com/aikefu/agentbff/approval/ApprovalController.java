package com.aikefu.agentbff.approval;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class ApprovalController {

  /** 高风险写操作工具白名单 — 这些工具坐席侧执行前必须先申请审批。 */
  static final java.util.Set<String> HIGH_RISK_TOOLS =
      java.util.Set.of(
          "cancel_subscription",
          "refund",
          "ban_user",
          "minor_refund");

  private final ApprovalStore store;

  public ApprovalController(ApprovalStore store) {
    this.store = store;
  }

  /** 坐席提交审批申请。 */
  @PostMapping("/agent/approvals")
  public Map<String, Object> submit(
      @RequestHeader("X-Agent-Id") long agentId, @RequestBody Map<String, Object> body) {
    String tool = String.valueOf(body.getOrDefault("tool", ""));
    if (!HIGH_RISK_TOOLS.contains(tool)) {
      throw new IllegalArgumentException(
          "tool not in high-risk list: " + tool + " (allowed=" + HIGH_RISK_TOOLS + ")");
    }
    String sid = String.valueOf(body.getOrDefault("session_id", ""));
    @SuppressWarnings("unchecked")
    Map<String, Object> args = body.get("args") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    String reason = String.valueOf(body.getOrDefault("reason", ""));
    return store.submit(agentId, sid, tool, args, reason);
  }

  /** 坐席查询自己提交的审批状态(轮询用)。 */
  @GetMapping("/agent/approvals/{id}")
  public ResponseEntity<Map<String, Object>> getOwn(
      @RequestHeader("X-Agent-Id") long agentId, @PathVariable("id") String id) {
    Map<String, Object> a = store.get(id);
    if (a == null) return ResponseEntity.notFound().build();
    Object owner = a.get("agent_id");
    if (owner instanceof Number n && n.longValue() != agentId) {
      return ResponseEntity.status(403).build();
    }
    return ResponseEntity.ok(a);
  }

  /** 主管列出全部 pending。 */
  @GetMapping("/supervisor/approvals")
  public List<Map<String, Object>> pending() {
    return store.pending();
  }

  /** 主管批准 / 驳回。 */
  @PostMapping("/supervisor/approvals/{id}/decide")
  public Map<String, Object> decide(
      @RequestHeader("X-Agent-Id") long supervisorId,
      @PathVariable("id") String id,
      @RequestBody Map<String, Object> body) {
    boolean approve = Boolean.TRUE.equals(body.get("approve"));
    String comment = body.get("comment") == null ? null : String.valueOf(body.get("comment"));
    return store.decide(id, supervisorId, approve, comment);
  }
}
