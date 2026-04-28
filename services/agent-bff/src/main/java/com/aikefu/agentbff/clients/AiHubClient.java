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
}
