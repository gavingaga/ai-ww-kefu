package com.aikefu.agentbff.clients;

import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 调 session-svc 的轻量适配。 */
@Component
public class SessionClient {

  private final RestClient client;

  public SessionClient(@Qualifier("sessionRestClient") RestClient client) {
    this.client = client;
  }

  public Map<String, Object> session(String id) {
    return client.get().uri("/v1/sessions/{id}", id).retrieve().body(new ParameterizedTypeReference<>() {});
  }

  public java.util.List<Map<String, Object>> listByStatus(String status, int limit) {
    String uri = "/v1/sessions?limit=" + limit + (status == null ? "" : "&status=" + status);
    return client.get().uri(uri).retrieve().body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> messages(String id, long before, int limit) {
    return client
        .get()
        .uri("/v1/sessions/{id}/messages?before={b}&limit={l}", id, before, limit)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> append(
      String id, String idempotencyKey, Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/sessions/{id}/messages", id)
        .header("Idempotency-Key", idempotencyKey == null ? "" : idempotencyKey)
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public void close(String id) {
    client.post().uri("/v1/sessions/{id}/close", id).retrieve().toBodilessEntity();
  }
}
