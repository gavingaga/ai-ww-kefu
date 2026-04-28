package com.aikefu.agentbff.clients;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 审计客户端 — fire-and-forget,任何异常静默吞掉,绝不阻塞主链路。
 *
 * <p>当 {@code aikefu.audit-svc.enabled=false} 时整体禁用(eg. 单元测试)。
 */
@Component
public class AuditClient {

  private static final Logger LOG = LoggerFactory.getLogger(AuditClient.class);

  private final RestClient client;
  private final boolean enabled;
  private final Executor pool = Executors.newSingleThreadExecutor(
      r -> {
        Thread t = new Thread(r, "audit-emit");
        t.setDaemon(true);
        return t;
      });

  public AuditClient(
      @Qualifier("auditRestClient") RestClient client,
      @Value("${aikefu.audit-svc.enabled:true}") boolean enabled) {
    this.client = client;
    this.enabled = enabled;
  }

  public boolean enabled() {
    return enabled;
  }

  /** fire-and-forget;返回 true 表示已提交到线程池。 */
  public boolean emit(Map<String, Object> event) {
    if (!enabled || event == null || event.isEmpty()) return false;
    pool.execute(() -> {
      try {
        client
            .post()
            .uri("/v1/audit/events")
            .body(event)
            .retrieve()
            .body(new ParameterizedTypeReference<Map<String, Object>>() {});
      } catch (Exception e) {
        LOG.debug("audit emit failed: {}", e.toString());
      }
    });
    return true;
  }

  /** 透传查询(仅管理后台用)。 */
  public Map<String, Object> query(String params) {
    String path = "/v1/audit/events" + (params == null || params.isBlank() ? "" : "?" + params);
    return client.get().uri(path).retrieve().body(new ParameterizedTypeReference<>() {});
  }
}
