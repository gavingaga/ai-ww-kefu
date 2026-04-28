package com.aikefu.agentbff.clients;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class ToolClient {

  private final RestClient client;

  public ToolClient(@Qualifier("toolRestClient") RestClient client) {
    this.client = client;
  }

  public List<Map<String, Object>> list() {
    return client
        .get()
        .uri("/v1/tools")
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> invoke(String name, Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/tools/{name}/invoke", name)
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }
}
