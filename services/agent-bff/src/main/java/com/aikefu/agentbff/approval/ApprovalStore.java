package com.aikefu.agentbff.approval;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.stereotype.Component;

import com.aikefu.agentbff.audit.Auditor;

/**
 * 高风险操作二次审批 — M3 内存版,生产替换为 Mongo / MySQL。
 *
 * <p>一条审批携带:申请方坐席 + sessionId + tool + args + reason + status
 * (pending / approved / rejected),最多 24h(本实现仅按状态查询,过期回收交给上层)。
 */
@Component
public class ApprovalStore {

  private final ConcurrentMap<String, Map<String, Object>> pool = new ConcurrentHashMap<>();
  private final Auditor auditor;

  public ApprovalStore(Auditor auditor) {
    this.auditor = auditor;
  }

  public Map<String, Object> submit(
      long agentId,
      String sessionId,
      String tool,
      Map<String, Object> args,
      String reason) {
    String id = "apv_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    Map<String, Object> a = new LinkedHashMap<>();
    a.put("id", id);
    a.put("agent_id", agentId);
    a.put("session_id", sessionId);
    a.put("tool", tool);
    a.put("args", args == null ? Map.of() : args);
    a.put("reason", reason == null ? "" : reason);
    a.put("status", "pending");
    a.put("created_at", Instant.now().toString());
    pool.put(id, a);
    auditor.log(
        "approval.submit",
        agentId,
        "AGENT",
        sessionId,
        tool,
        "请求审批 " + tool,
        Map.of("approval_id", id, "reason", reason == null ? "" : reason));
    return a;
  }

  public List<Map<String, Object>> pending() {
    List<Map<String, Object>> out = new ArrayList<>();
    pool.values().forEach(a -> {
      if ("pending".equals(a.get("status"))) out.add(a);
    });
    out.sort((x, y) -> String.valueOf(y.get("created_at")).compareTo(String.valueOf(x.get("created_at"))));
    return out;
  }

  public Map<String, Object> get(String id) {
    return pool.get(id);
  }

  public Map<String, Object> decide(String id, long supervisorId, boolean approve, String comment) {
    Map<String, Object> a = pool.get(id);
    if (a == null) throw new IllegalArgumentException("approval not found: " + id);
    if (!"pending".equals(a.get("status"))) {
      throw new IllegalStateException("not pending: " + a.get("status"));
    }
    a.put("status", approve ? "approved" : "rejected");
    a.put("decided_by", supervisorId);
    if (comment != null && !comment.isBlank()) a.put("comment", comment);
    a.put("decided_at", Instant.now().toString());
    auditor.log(
        approve ? "approval.approve" : "approval.reject",
        supervisorId,
        "SUPERVISOR",
        String.valueOf(a.get("session_id")),
        String.valueOf(a.get("tool")),
        (approve ? "通过 " : "驳回 ") + a.get("tool"),
        Map.of(
            "approval_id", id,
            "agent_id", a.get("agent_id"),
            "comment", comment == null ? "" : comment));
    return a;
  }
}
