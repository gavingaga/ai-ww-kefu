package com.aikefu.agentbff.clients;

import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class ReportClient {

  private final RestClient client;

  public ReportClient(@Qualifier("reportRestClient") RestClient client) {
    this.client = client;
  }

  public Map<String, Object> report(String kind, int windowMin, Integer bucketSec) {
    StringBuilder uri = new StringBuilder("/v1/report/").append(kind).append("?window_min=").append(windowMin);
    if (bucketSec != null) uri.append("&bucket_sec=").append(bucketSec);
    return client.get().uri(uri.toString()).retrieve().body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> append(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/events")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }
}
