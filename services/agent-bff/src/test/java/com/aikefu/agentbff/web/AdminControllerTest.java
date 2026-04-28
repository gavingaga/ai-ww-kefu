package com.aikefu.agentbff.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.aikefu.agentbff.clients.KbClient;

class AdminControllerTest {

  @Test
  void debugSearchPassesBodyThroughToKbClient() {
    KbClient kb = mock(KbClient.class);
    Map<String, Object> stub =
        Map.of(
            "query", "卡顿",
            "store_size", 10,
            "vector", List.of(),
            "bm25", List.of(),
            "rrf", List.of(),
            "rerank", List.of(),
            "hits", List.of());
    when(kb.debugSearch(any())).thenReturn(stub);

    AdminController c = new AdminController(kb);
    Map<String, Object> body =
        Map.of("query", "卡顿", "top_k", 3, "vector_top", 20, "bm25_top", 20);
    Map<String, Object> resp = c.kbDebugSearch(body);

    assertThat(resp).containsKey("rerank");
    assertThat(resp.get("query")).isEqualTo("卡顿");
    verify(kb).debugSearch(body);
  }

  @Test
  void statsDelegatesToKbClient() {
    KbClient kb = mock(KbClient.class);
    when(kb.stats()).thenReturn(Map.of("chunks", 12, "embedder", "HashEmbedder"));
    AdminController c = new AdminController(kb);
    Map<String, Object> r = c.kbStats();
    assertThat(r.get("chunks")).isEqualTo(12);
  }
}
