package com.aikefu.agentbff.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.aikefu.agentbff.clients.AuditClient;
import com.aikefu.agentbff.clients.KbClient;
import com.aikefu.agentbff.clients.NotifyClient;
import com.aikefu.agentbff.clients.ReportClient;
import com.aikefu.agentbff.clients.LlmRouterClient;
import com.aikefu.agentbff.clients.RoutingClient;
import com.aikefu.agentbff.clients.ToolClient;

class AdminControllerTest {

  @Test
  void debugSearchPassesBodyThroughToKbClient() {
    KbClient kb = mock(KbClient.class);
    NotifyClient notify = mock(NotifyClient.class);
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

    AdminController c = new AdminController(kb, notify, mock(RoutingClient.class), mock(AuditClient.class), mock(ReportClient.class), mock(ToolClient.class), mock(LlmRouterClient.class));
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
    NotifyClient notify = mock(NotifyClient.class);
    when(kb.stats()).thenReturn(Map.of("chunks", 12, "embedder", "HashEmbedder"));
    AdminController c = new AdminController(kb, notify, mock(RoutingClient.class), mock(AuditClient.class), mock(ReportClient.class), mock(ToolClient.class), mock(LlmRouterClient.class));
    Map<String, Object> r = c.kbStats();
    assertThat(r.get("chunks")).isEqualTo(12);
  }

  @Test
  void ingestDelegatesToKbClient() {
    KbClient kb = mock(KbClient.class);
    NotifyClient notify = mock(NotifyClient.class);
    Map<String, Object> body =
        Map.of("id", "doc_x", "kb_id", "default", "title", "T", "body", "B");
    when(kb.ingest(any())).thenReturn(Map.of("ok", true, "chunks", 3, "doc_id", "doc_x"));
    AdminController c = new AdminController(kb, notify, mock(RoutingClient.class), mock(AuditClient.class), mock(ReportClient.class), mock(ToolClient.class), mock(LlmRouterClient.class));
    Map<String, Object> r = c.kbIngest(body);
    assertThat(r.get("ok")).isEqualTo(true);
    verify(kb).ingest(body);
  }

  @Test
  void dashboardDelegatesToRoutingClient() {
    KbClient kb = mock(KbClient.class);
    NotifyClient notify = mock(NotifyClient.class);
    RoutingClient routing = mock(RoutingClient.class);
    when(routing.dashboard())
        .thenReturn(Map.of("kpi", Map.of("queue_total", 3), "agents", List.of(), "queue", List.of()));
    AdminController c = new AdminController(kb, notify, routing, mock(AuditClient.class), mock(ReportClient.class), mock(ToolClient.class), mock(LlmRouterClient.class));
    Map<String, Object> r = c.dashboard();
    assertThat(r).containsKey("kpi");
    verify(routing).dashboard();
  }

  @Test
  void auditEventsDelegateToAuditClient() {
    KbClient kb = mock(KbClient.class);
    NotifyClient notify = mock(NotifyClient.class);
    AuditClient audit = mock(AuditClient.class);
    when(audit.query(any()))
        .thenReturn(Map.of("items", List.of(Map.of("kind", "supervisor.observe")), "size", 1));
    AdminController c = new AdminController(kb, notify, mock(RoutingClient.class), audit, mock(ReportClient.class), mock(ToolClient.class), mock(LlmRouterClient.class));
    Map<String, Object> r = c.auditEvents("supervisor.observe", null, null, null, 50);
    assertThat(r.get("size")).isEqualTo(1);
    verify(audit).query(any());
  }

  @Test
  void faqEndpointsDelegateToNotifyClient() {
    KbClient kb = mock(KbClient.class);
    NotifyClient notify = mock(NotifyClient.class);
    when(notify.faqTrees()).thenReturn(List.of(Map.of("scene", "play")));
    when(notify.faqPreview(any())).thenReturn(Map.of("hit", true, "node_id", "n1"));
    AdminController c = new AdminController(kb, notify, mock(RoutingClient.class), mock(AuditClient.class), mock(ReportClient.class), mock(ToolClient.class), mock(LlmRouterClient.class));

    assertThat(c.faqTrees()).hasSize(1);
    Map<String, Object> p = c.faqPreview(Map.of("query", "看视频卡顿"));
    assertThat(p.get("hit")).isEqualTo(true);
    verify(notify).faqPreview(Map.of("query", "看视频卡顿"));
  }
}
