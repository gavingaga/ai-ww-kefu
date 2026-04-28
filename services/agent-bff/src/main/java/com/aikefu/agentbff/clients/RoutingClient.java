package com.aikefu.agentbff.clients;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 调 routing-svc 的轻量适配。 */
@Component
public class RoutingClient {

  private final RestClient client;

  public RoutingClient(@Qualifier("routingRestClient") RestClient client) {
    this.client = client;
  }

  public List<Map<String, Object>> listQueue(String skillGroup) {
    String path = skillGroup == null || skillGroup.isBlank()
        ? "/v1/queue"
        : "/v1/queue?skill_group=" + skillGroup;
    return client.get().uri(path).retrieve().body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> peek(long agentId) {
    return client
        .post()
        .uri("/v1/agents/{id}/peek", agentId)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> assign(long agentId, String entryId) {
    return client
        .post()
        .uri("/v1/agents/{id}/assign", agentId)
        .body(Map.of("entry_id", entryId))
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public void release(long agentId, String sessionId) {
    client
        .post()
        .uri("/v1/sessions/{sid}/release?agent_id=" + agentId, sessionId)
        .retrieve()
        .toBodilessEntity();
  }

  public Map<String, Object> setStatus(long agentId, String status) {
    return client
        .post()
        .uri("/v1/agents/{id}/status", agentId)
        .body(Map.of("status", status))
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> registerAgent(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/agents")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> getAgent(long id) {
    return client
        .get()
        .uri("/v1/agents/{id}", id)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> stats() {
    return client.get().uri("/v1/stats").retrieve().body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> dashboard() {
    return client
        .get()
        .uri("/v1/dashboard")
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  // ───── 主管干预(T-302) ─────

  public Map<String, Object> transfer(long fromAgentId, long toAgentId, String sessionId) {
    return client
        .post()
        .uri("/v1/sessions/{sid}/transfer", sessionId)
        .body(Map.of("from_agent_id", fromAgentId, "to_agent_id", toAgentId))
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> observe(long supervisorId, String sessionId) {
    return client
        .post()
        .uri("/v1/supervisors/{id}/observe", supervisorId)
        .body(Map.of("session_id", sessionId))
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> unobserve(long supervisorId, String sessionId) {
    return client
        .post()
        .uri("/v1/supervisors/{id}/unobserve", supervisorId)
        .body(Map.of("session_id", sessionId))
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public List<Map<String, Object>> supervisors() {
    return client
        .get()
        .uri("/v1/supervisors")
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  /** 反查会话相关坐席:active(承接的)+ observers(观察的主管)。 */
  public java.util.Map<String, java.util.List<Long>> agentsForSession(String sessionId) {
    java.util.Map<String, java.util.List<Long>> out = new java.util.LinkedHashMap<>();
    out.put("active", java.util.List.of());
    out.put("observers", java.util.List.of());
    try {
      Map<String, Object> body =
          client
              .get()
              .uri("/v1/sessions/{sid}/agents", sessionId)
              .retrieve()
              .body(new ParameterizedTypeReference<>() {});
      if (body != null) {
        out.put("active", asLongList(body.get("active")));
        out.put("observers", asLongList(body.get("observers")));
      }
    } catch (Exception ignored) {
      // 推送主链路不应被路由失败阻塞
    }
    return out;
  }

  private static java.util.List<Long> asLongList(Object v) {
    if (!(v instanceof java.util.Collection<?> c)) return java.util.List.of();
    java.util.List<Long> out = new java.util.ArrayList<>();
    for (Object o : c) {
      if (o instanceof Number n) out.add(n.longValue());
      else if (o != null) {
        try {
          out.add(Long.parseLong(String.valueOf(o)));
        } catch (NumberFormatException ignored) {
          // skip
        }
      }
    }
    return out;
  }

  /** 列出正在观察某会话的主管 ID 集合;失败 / 网络异常时回空。 */
  public java.util.List<Long> observersOf(String sessionId) {
    try {
      Map<String, Object> body =
          client
              .get()
              .uri("/v1/sessions/{sid}/observers", sessionId)
              .retrieve()
              .body(new ParameterizedTypeReference<>() {});
      Object obs = body == null ? null : body.get("observers");
      if (obs instanceof java.util.Collection<?> c) {
        java.util.List<Long> out = new java.util.ArrayList<>();
        for (Object o : c) {
          if (o instanceof Number n) out.add(n.longValue());
          else if (o != null) {
            try {
              out.add(Long.parseLong(String.valueOf(o)));
            } catch (NumberFormatException ignored) {
              // skip non-numeric entries
            }
          }
        }
        return out;
      }
    } catch (Exception ignored) {
      // 推送链路不应被路由失败阻塞
    }
    return java.util.List.of();
  }
}
