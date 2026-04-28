package com.aikefu.agentbff.audit;

import java.util.LinkedHashMap;
import java.util.Map;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.aikefu.agentbff.clients.AuditClient;

/**
 * 审计埋点门面 — 统一字段名 + fire-and-forget。
 *
 * <p>kind 命名规范:领域.动词,如 {@code session.accept}、{@code supervisor.transfer}。
 * 所有方法不抛、不返回。
 */
@Component
public class Auditor {

  private static final Logger LOG = LoggerFactory.getLogger(Auditor.class);

  private final AuditClient client;
  private final RestClient reportClient;
  private final boolean reportEnabled;
  private final Executor pool = Executors.newSingleThreadExecutor(r -> {
    Thread t = new Thread(r, "auditor-report");
    t.setDaemon(true);
    return t;
  });

  @Autowired
  public Auditor(
      AuditClient client,
      @org.springframework.beans.factory.annotation.Qualifier("reportRestClient") RestClient reportClient,
      @Value("${aikefu.report-svc.enabled:true}") boolean reportEnabled) {
    this.client = client;
    this.reportClient = reportClient;
    this.reportEnabled = reportEnabled;
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
    mirrorToReport(ev);
  }

  /** 同 Auditor.log 一份镜像写到 report-svc /v1/events,做实时报表底座。 */
  private void mirrorToReport(Map<String, Object> ev) {
    if (!reportEnabled) return;
    pool.execute(() -> {
      try {
        reportClient.post().uri("/v1/events").body(ev).retrieve()
            .body(new ParameterizedTypeReference<Map<String, Object>>() {});
      } catch (Exception e) {
        LOG.debug("report mirror failed: {}", e.toString());
      }
    });
  }

  public void log(String kind, Long actorId, String actorRole, String sessionId, String action) {
    log(kind, actorId, actorRole, sessionId, null, action, null);
  }
}
