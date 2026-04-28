package com.aikefu.agentbff.audit;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.aikefu.agentbff.clients.AuditClient;

/**
 * 审计埋点门面 — 统一字段名 + fire-and-forget。
 *
 * <p>kind 命名规范:领域.动词,如 {@code session.accept}、{@code supervisor.transfer}。
 * 所有方法不抛、不返回。
 */
@Component
public class Auditor {

  private final AuditClient client;

  public Auditor(AuditClient client) {
    this.client = client;
  }

  /** 主管 / 坐席动作。actorRole 用 AGENT / SUPERVISOR / SYSTEM / ADMIN。 */
  public void log(
      String kind,
      Long actorId,
      String actorRole,
      String sessionId,
      String target,
      String action,
      Map<String, Object> meta) {
    Map<String, Object> ev = new LinkedHashMap<>();
    ev.put("kind", kind);
    if (actorId != null) {
      Map<String, Object> actor = new LinkedHashMap<>();
      actor.put("id", actorId);
      if (actorRole != null) actor.put("role", actorRole);
      ev.put("actor", actor);
    }
    if (sessionId != null) ev.put("sessionId", sessionId);
    if (target != null) ev.put("target", target);
    if (action != null) ev.put("action", action);
    if (meta != null && !meta.isEmpty()) ev.put("meta", meta);
    client.emit(ev);
  }

  public void log(String kind, Long actorId, String actorRole, String sessionId, String action) {
    log(kind, actorId, actorRole, sessionId, null, action, null);
  }
}
