package com.aikefu.agentbff.clients;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 调 notify-svc 的轻量适配 — 当前只用 FAQ 管理路径。 */
@Component
public class NotifyClient {

  private final RestClient client;

  public NotifyClient(@Qualifier("notifyRestClient") RestClient client) {
    this.client = client;
  }

  public List<Map<String, Object>> faqTrees() {
    return client
        .get()
        .uri("/admin/v1/faq/trees")
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> saveFaqTree(Map<String, Object> tree) {
    return client
        .put()
        .uri("/admin/v1/faq/trees")
        .body(tree)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> faqPreview(Map<String, Object> body) {
    return client
        .post()
        .uri("/admin/v1/faq/preview")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }
}
