package com.aikefu.agentbff.clients;

import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class AiHubClient {

  private final RestClient client;

  public AiHubClient(@Qualifier("aiHubRestClient") RestClient client) {
    this.client = client;
  }

  public Map<String, Object> suggest(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/ai/suggest")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public java.util.List<Map<String, Object>> listPrompts() {
    return client
        .get()
        .uri("/v1/prompts")
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> previewPrompt(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/prompts/preview")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> decidePreview(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/ai/decide")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }
}
