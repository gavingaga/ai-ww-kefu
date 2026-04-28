package com.aikefu.tool.clients;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 工具调用审计 — fire-and-forget 写 audit-svc。 */
@Component
public class AuditEmitter {

  private static final Logger LOG = LoggerFactory.getLogger(AuditEmitter.class);
  private final RestClient client;
  private final boolean enabled;
  private final Executor pool = Executors.newSingleThreadExecutor(r -> {
    Thread t = new Thread(r, "tool-audit-emit");
    t.setDaemon(true);
    return t;
  });

  public AuditEmitter(
      @Value("${aikefu.audit-svc.url:http://localhost:8085}") String baseUrl,
      @Value("${aikefu.audit-svc.timeout-ms:1500}") int timeoutMs,
      @Value("${aikefu.audit-svc.enabled:true}") boolean enabled) {
    this.client = RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(SimpleFactory.simple(timeoutMs))
        .build();
    this.enabled = enabled;
  }

  public void emit(Map<String, Object> ev) {
    if (!enabled || ev == null || ev.isEmpty()) return;
    pool.execute(() -> {
      try {
        client.post().uri("/v1/audit/events").body(ev).retrieve().toBodilessEntity();
      } catch (Exception e) {
        LOG.debug("tool audit emit failed: {}", e.toString());
      }
    });
  }
}
