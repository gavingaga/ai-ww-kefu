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

  // ───── 公告 / 快捷按钮 ─────

  public List<Map<String, Object>> announcements() {
    return client
        .get()
        .uri("/v1/announcements")
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> saveAnnouncement(Map<String, Object> body) {
    Object id = body.get("id");
    if (id == null || String.valueOf(id).isBlank()) {
      return client
          .post()
          .uri("/v1/announcements")
          .body(body)
          .retrieve()
          .body(new ParameterizedTypeReference<>() {});
    }
    return client
        .put()
        .uri("/v1/announcements/{id}", id)
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public void deleteAnnouncement(String id) {
    client.delete().uri("/v1/announcements/{id}", id).retrieve().toBodilessEntity();
  }

  public List<Map<String, Object>> quickReplies() {
    return client
        .get()
        .uri("/v1/quick-replies")
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> saveQuickReply(Map<String, Object> body) {
    Object id = body.get("id");
    if (id == null || String.valueOf(id).isBlank()) {
      return client
          .post()
          .uri("/v1/quick-replies")
          .body(body)
          .retrieve()
          .body(new ParameterizedTypeReference<>() {});
    }
    return client
        .put()
        .uri("/v1/quick-replies/{id}", id)
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public void deleteQuickReply(String id) {
    client.delete().uri("/v1/quick-replies/{id}", id).retrieve().toBodilessEntity();
  }
}
