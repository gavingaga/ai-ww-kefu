package com.aikefu.report.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.aikefu.report.store.EventStore;

class ReportServiceTest {

  private ReportService newSvc() {
    EventStore s = new EventStore(10_000);
    s.append(Map.of("kind", "session.accept", "actor", Map.of("id", 7)));
    s.append(Map.of("kind", "session.accept", "actor", Map.of("id", 7)));
    s.append(Map.of("kind", "session.close", "actor", Map.of("id", 7)));
    s.append(Map.of("kind", "session.handoff", "meta", Map.of("reason", "minor_compliance")));
    s.append(Map.of("kind", "session.handoff", "meta", Map.of("reason", "rule_keyword")));
    s.append(
        Map.of("kind", "tool.invoke", "target", "get_play_diagnostics",
            "action", "ok", "meta", Map.of("duration_ms", 120)));
    s.append(
        Map.of("kind", "tool.invoke", "target", "get_play_diagnostics",
            "action", "ok", "meta", Map.of("duration_ms", 80)));
    s.append(Map.of("kind", "tool.invoke", "target", "cancel_subscription", "action", "dry_run",
        "meta", Map.of("duration_ms", 5)));
    s.append(Map.of("kind", "csat", "rating", 5, "tags", List.of("响应快", "专业")));
    s.append(Map.of("kind", "csat", "rating", 3, "tags", List.of("普通")));
    s.append(Map.of("kind", "csat", "rating", 5));
    return new ReportService(s);
  }

  @Test
  void kpiCountsAndDerivesRates() {
    Map<String, Object> r = newSvc().kpi(60);
    assertThat(r.get("session_accept")).isEqualTo(2);
    assertThat(r.get("session_close")).isEqualTo(1);
    assertThat(r.get("session_handoff")).isEqualTo(2);
    assertThat(r.get("tool_invocations")).isEqualTo(3);
    assertThat(r.get("csat_count")).isEqualTo(3);
    // (5+3+5)/3 ≈ 4.33
    assertThat((double) r.get("csat_avg")).isCloseTo(4.33, org.assertj.core.data.Offset.offset(0.01));
    // handoff_rate = 2 / (2 + 1 + 2) = 0.4
    assertThat((double) r.get("handoff_rate")).isCloseTo(0.4, org.assertj.core.data.Offset.offset(0.01));
  }

  @Test
  void csatBucketsAndTagsTopN() {
    Map<String, Object> r = newSvc().csat(60);
    Map<?, ?> dist = (Map<?, ?>) r.get("rating_distribution");
    assertThat(dist.get("5")).isEqualTo(2);
    assertThat(dist.get("3")).isEqualTo(1);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> tags = (List<Map<String, Object>>) r.get("top_tags");
    assertThat(tags).extracting(t -> t.get("key")).contains("响应快", "专业", "普通");
  }

  @Test
  void toolsRanksByTotalAndComputesOkRateAvgMs() {
    Map<String, Object> r = newSvc().tools(60);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows = (List<Map<String, Object>>) r.get("rows");
    assertThat(rows).hasSize(2);
    assertThat(rows.get(0).get("name")).isEqualTo("get_play_diagnostics");
    assertThat(rows.get(0).get("total")).isEqualTo(2);
    assertThat((int) rows.get(0).get("avg_ms")).isEqualTo(100);
    assertThat((double) rows.get(0).get("ok_rate")).isCloseTo(1.0, org.assertj.core.data.Offset.offset(0.01));
  }

  @Test
  void agentsGroupsByActorId() {
    Map<String, Object> r = newSvc().agents(60);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows = (List<Map<String, Object>>) r.get("rows");
    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).get("agent_id")).isEqualTo("7");
    assertThat(rows.get(0).get("accept")).isEqualTo(2);
    assertThat(rows.get(0).get("close")).isEqualTo(1);
  }

  @Test
  void handoffByReasonRanks() {
    Map<String, Object> r = newSvc().handoff(60);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows = (List<Map<String, Object>>) r.get("by_reason");
    assertThat(rows).extracting(t -> t.get("key")).contains("minor_compliance", "rule_keyword");
  }

  @Test
  void timeseriesPutsEventsIntoBuckets() {
    Map<String, Object> r = newSvc().timeseries(60, 60);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> bins = (List<Map<String, Object>>) r.get("bins");
    assertThat(bins).isNotEmpty();
  }
}
