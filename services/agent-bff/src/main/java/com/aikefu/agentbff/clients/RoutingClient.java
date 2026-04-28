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
}
