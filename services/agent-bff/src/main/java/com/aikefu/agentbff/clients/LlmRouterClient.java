package com.aikefu.agentbff.clients;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class LlmRouterClient {

  private final RestClient client;

  public LlmRouterClient(@Qualifier("llmRouterRestClient") RestClient client) {
    this.client = client;
  }

  public List<Map<String, Object>> listProfiles() {
    return client
        .get()
        .uri("/v1/profiles")
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> createProfile(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/profiles")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> updateProfile(String id, Map<String, Object> body) {
    return client
        .put()
        .uri("/v1/profiles/{id}", id)
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> deleteProfile(String id) {
    return client
        .delete()
        .uri("/v1/profiles/{id}", id)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> testProfile(String id, String prompt) {
    return client
        .post()
        .uri("/v1/profiles/{id}/test", id)
        .body(Map.of("prompt", prompt == null ? "" : prompt))
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> profileQuota(String id) {
    return client
        .get()
        .uri("/v1/profiles/{id}/quota", id)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> profileHealth(String id) {
    return client
        .get()
        .uri("/v1/profiles/{id}/health", id)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }
}
