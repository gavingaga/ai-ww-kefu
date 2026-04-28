package com.aikefu.audit.store;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.aikefu.audit.domain.AuditEvent;
import com.aikefu.audit.domain.AuditEvent.Actor;

class AuditStoreTest {

  @Test
  void appendAssignsIdAndTs() {
    AuditStore s = new AuditStore(100);
    AuditEvent saved =
        s.append(AuditEvent.builder().kind("session.accept").action("接入").build());
    assertThat(saved.getId()).startsWith("au_");
    assertThat(saved.getTs()).isNotNull();
    assertThat(s.size()).isEqualTo(1);
  }

  @Test
  void queryFiltersByKindActorAndSession() {
    AuditStore s = new AuditStore(100);
    s.append(
        AuditEvent.builder()
            .kind("supervisor.transfer")
            .actor(Actor.builder().id(7L).role("SUPERVISOR").build())
            .sessionId("ses_a")
            .action("transfer")
            .build());
    s.append(
        AuditEvent.builder()
            .kind("session.accept")
            .actor(Actor.builder().id(7L).role("AGENT").build())
            .sessionId("ses_b")
            .action("accept")
            .build());
    s.append(
        AuditEvent.builder()
            .kind("supervisor.transfer")
            .actor(Actor.builder().id(9L).role("SUPERVISOR").build())
            .sessionId("ses_a")
            .action("transfer-other")
            .build());

    assertThat(s.query("supervisor.transfer", null, null, null, 10)).hasSize(2);
    assertThat(s.query(null, 7L, null, null, 10)).hasSize(2);
    assertThat(s.query(null, null, "ses_a", null, 10)).hasSize(2);
    assertThat(s.query("session.accept", 7L, "ses_b", null, 10)).hasSize(1);
  }

  @Test
  void queryReturnsNewestFirst() {
    AuditStore s = new AuditStore(100);
    AuditEvent a = s.append(AuditEvent.builder().kind("k").action("a").build());
    AuditEvent b = s.append(AuditEvent.builder().kind("k").action("b").build());
    var items = s.query(null, null, null, null, 10);
    assertThat(items.get(0).getId()).isEqualTo(b.getId());
    assertThat(items.get(1).getId()).isEqualTo(a.getId());
  }

  @Test
  void capacityEvictsOldest() {
    AuditStore s = new AuditStore(100);  // min=100
    for (int i = 0; i < 150; i++) {
      s.append(AuditEvent.builder().kind("k").action("a" + i).build());
    }
    assertThat(s.size()).isEqualTo(100);
    var items = s.query(null, null, null, null, 200);
    assertThat(items.get(0).getAction()).isEqualTo("a149");
  }

  @Test
  void sinceFilterCutsOldEvents() {
    AuditStore s = new AuditStore(100);
    s.append(
        AuditEvent.builder()
            .kind("k")
            .ts(Instant.parse("2024-01-01T00:00:00Z"))
            .action("old")
            .build());
    s.append(
        AuditEvent.builder()
            .kind("k")
            .ts(Instant.parse("2026-04-28T00:00:00Z"))
            .action("new")
            .build());
    var items = s.query(null, null, null, Instant.parse("2026-01-01T00:00:00Z"), 10);
    assertThat(items).extracting(AuditEvent::getAction).containsExactly("new");
  }

  @Test
  void metaIsPreserved() {
    AuditStore s = new AuditStore(100);
    AuditEvent ev =
        s.append(
            AuditEvent.builder()
                .kind("kb.ingest")
                .meta(Map.of("doc_id", "doc_x", "chunks", 7))
                .build());
    assertThat(ev.getMeta()).containsEntry("doc_id", "doc_x").containsEntry("chunks", 7);
  }
}
