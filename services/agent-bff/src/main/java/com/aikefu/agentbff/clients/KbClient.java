package com.aikefu.agentbff.clients;

import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 调 kb-svc 的轻量适配 — 仅提供管理后台需要的只读端点。 */
@Component
public class KbClient {

  private final RestClient client;

  public KbClient(@Qualifier("kbRestClient") RestClient client) {
    this.client = client;
  }

  public Map<String, Object> stats() {
    return client.get().uri("/v1/kb/stats").retrieve().body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> debugSearch(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/kb/debug/search")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> match(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/kb/match")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> ingest(Map<String, Object> body) {
    return client
        .post()
        .uri("/v1/kb/ingest")
        .body(body)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> listDocs() {
    return client.get().uri("/v1/kb/docs").retrieve().body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> deleteDoc(String docId) {
    return client
        .delete()
        .uri("/v1/kb/docs/{id}", docId)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  public Map<String, Object> reindexDoc(String docId) {
    return client
        .post()
        .uri("/v1/kb/docs/{id}/reindex", docId)
        .retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }
}
