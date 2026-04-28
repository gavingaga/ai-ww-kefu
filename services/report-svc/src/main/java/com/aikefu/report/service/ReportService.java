package com.aikefu.report.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.stereotype.Service;

import com.aikefu.report.store.EventStore;

/**
 * 聚合报表 — 在内存事件流之上做几个常用的统计;无 SQL,纯流式遍历。
 *
 * <p>支持的 kind:
 *
 * <ul>
 *   <li>{@code kpi} — 总览(各类事件计数 / handoff_rate / csat_avg)
 *   <li>{@code csat} — 满意度分布(评分桶 + tag 频次)
 *   <li>{@code tools} — 工具调用 TopN(成功率 / 平均耗时)
 *   <li>{@code agents} — 坐席接入 / 关闭次数 TopN
 *   <li>{@code handoff} — 转人工原因分布
 *   <li>{@code timeseries} — 按 5 分钟桶聚合各事件计数
 * </ul>
 */
@Service
public class ReportService {

  private final EventStore store;

  public ReportService(EventStore store) {
    this.store = store;
  }

  public Map<String, Object> kpi(int windowMin) {
    long cutoff = cutoff(windowMin);
    int handoffN = 0;
    int closeN = 0;
    int toolN = 0;
    int csatN = 0;
    long csatSum = 0;
    int sessionAccept = 0;
    for (Map<String, Object> ev : recent(cutoff)) {
      String kind = String.valueOf(ev.getOrDefault("kind", ""));
      if (kind.equals("session.handoff")) handoffN++;
      else if (kind.equals("session.close")) closeN++;
      else if (kind.equals("session.accept")) sessionAccept++;
      else if (kind.equals("tool.invoke")) toolN++;
      else if (kind.equals("csat")) {
        csatN++;
        csatSum += asLong(ev.get("rating"));
      }
    }
    int total = handoffN + closeN + sessionAccept;
    double handoffRate = total == 0 ? 0 : (double) handoffN / total;
    double csatAvg = csatN == 0 ? 0 : (double) csatSum / csatN;
    return Map.of(
        "window_min", windowMin,
        "session_accept", sessionAccept,
        "session_close", closeN,
        "session_handoff", handoffN,
        "tool_invocations", toolN,
        "csat_count", csatN,
        "csat_avg", round(csatAvg, 2),
        "handoff_rate", round(handoffRate, 3));
  }

  public Map<String, Object> csat(int windowMin) {
    long cutoff = cutoff(windowMin);
    int[] buckets = new int[6]; // 0..5
    Map<String, Integer> tagFreq = new LinkedHashMap<>();
    for (Map<String, Object> ev : recent(cutoff)) {
      if (!"csat".equals(ev.get("kind"))) continue;
      int r = (int) asLong(ev.get("rating"));
      if (r >= 1 && r <= 5) buckets[r]++;
      Object tagsRaw = ev.get("tags");
      if (tagsRaw instanceof List<?> ts) {
        for (Object t : ts) {
          String s = String.valueOf(t);
          tagFreq.merge(s, 1, Integer::sum);
        }
      }
    }
    Map<String, Object> dist = new LinkedHashMap<>();
    for (int i = 1; i <= 5; i++) dist.put(String.valueOf(i), buckets[i]);
    return Map.of(
        "window_min", windowMin,
        "rating_distribution", dist,
        "top_tags", topN(tagFreq, 10));
  }

  public Map<String, Object> tools(int windowMin) {
    long cutoff = cutoff(windowMin);
    Map<String, int[]> stats = new LinkedHashMap<>(); // {ok, total, durSum}
    for (Map<String, Object> ev : recent(cutoff)) {
      if (!"tool.invoke".equals(ev.get("kind"))) continue;
      String name = String.valueOf(ev.getOrDefault("target", "unknown"));
      Map<String, Object> meta = asMap(ev.get("meta"));
      String outcome = String.valueOf(ev.getOrDefault("action", ""));
      int dur = (int) asLong(meta.get("duration_ms"));
      int[] s = stats.computeIfAbsent(name, k -> new int[3]);
      s[1]++;
      if ("ok".equals(outcome) || "dry_run".equals(outcome)) s[0]++;
      s[2] += dur;
    }
    List<Map<String, Object>> rows = new ArrayList<>();
    stats.forEach((name, s) -> rows.add(Map.of(
        "name", name,
        "total", s[1],
        "ok_rate", s[1] == 0 ? 0 : round((double) s[0] / s[1], 3),
        "avg_ms", s[1] == 0 ? 0 : s[2] / s[1])));
    rows.sort((a, b) -> Integer.compare((int) b.get("total"), (int) a.get("total")));
    return Map.of("window_min", windowMin, "rows", rows);
  }

  public Map<String, Object> agents(int windowMin) {
    long cutoff = cutoff(windowMin);
    Map<String, int[]> stats = new LinkedHashMap<>(); // {accept, close, transfer, whisper}
    for (Map<String, Object> ev : recent(cutoff)) {
      String kind = String.valueOf(ev.getOrDefault("kind", ""));
      Map<String, Object> actor = asMap(ev.get("actor"));
      Object aid = actor.get("id");
      if (aid == null) continue;
      String key = String.valueOf(aid);
      int[] s = stats.computeIfAbsent(key, k -> new int[4]);
      switch (kind) {
        case "session.accept" -> s[0]++;
        case "session.close" -> s[1]++;
        case "supervisor.transfer" -> s[2]++;
        case "supervisor.whisper" -> s[3]++;
        default -> {
          /* skip */
        }
      }
    }
    List<Map<String, Object>> rows = new ArrayList<>();
    stats.forEach((id, s) -> rows.add(Map.of(
        "agent_id", id,
        "accept", s[0],
        "close", s[1],
        "transfer", s[2],
        "whisper", s[3],
        "total", s[0] + s[1] + s[2] + s[3])));
    rows.sort((a, b) -> Integer.compare((int) b.get("total"), (int) a.get("total")));
    return Map.of("window_min", windowMin, "rows", rows);
  }

  public Map<String, Object> handoff(int windowMin) {
    long cutoff = cutoff(windowMin);
    Map<String, Integer> reasonFreq = new LinkedHashMap<>();
    for (Map<String, Object> ev : recent(cutoff)) {
      if (!"session.handoff".equals(ev.get("kind"))) continue;
      Map<String, Object> meta = asMap(ev.get("meta"));
      String reason = String.valueOf(meta.getOrDefault("reason", "unknown"));
      reasonFreq.merge(reason, 1, Integer::sum);
    }
    return Map.of("window_min", windowMin, "by_reason", topN(reasonFreq, 20));
  }

  public Map<String, Object> timeseries(int windowMin, int bucketSec) {
    long cutoff = cutoff(windowMin);
    int bucketMs = Math.max(60, bucketSec) * 1000;
    TreeMap<Long, Map<String, Integer>> bins = new TreeMap<>();
    for (Map<String, Object> ev : recent(cutoff)) {
      long ts = asLong(ev.get("ts_ms"));
      if (ts == 0) continue;
      long bucket = (ts / bucketMs) * bucketMs;
      String k = String.valueOf(ev.getOrDefault("kind", ""));
      bins.computeIfAbsent(bucket, x -> new LinkedHashMap<>()).merge(k, 1, Integer::sum);
    }
    List<Map<String, Object>> rows = new ArrayList<>();
    bins.forEach((b, c) -> {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("bucket_ms", b);
      row.put("counts", c);
      rows.add(row);
    });
    return Map.of("window_min", windowMin, "bucket_sec", bucketSec, "bins", rows);
  }

  // ───── helpers ─────

  private List<Map<String, Object>> recent(long cutoffMs) {
    if (cutoffMs <= 0) return store.snapshot();
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> ev : store.snapshot()) {
      if (asLong(ev.get("ts_ms")) >= cutoffMs) out.add(ev);
    }
    return out;
  }

  private static long cutoff(int windowMin) {
    if (windowMin <= 0) return 0;
    return Instant.now().minusSeconds(windowMin * 60L).toEpochMilli();
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asMap(Object v) {
    return v instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
  }

  private static long asLong(Object v) {
    if (v instanceof Number n) return n.longValue();
    if (v == null) return 0;
    try {
      return Long.parseLong(String.valueOf(v));
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  private static double round(double v, int p) {
    double f = Math.pow(10, p);
    return Math.round(v * f) / f;
  }

  private static List<Map<String, Object>> topN(Map<String, Integer> m, int n) {
    return m.entrySet().stream()
        .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
        .limit(n)
        .map(e -> {
          Map<String, Object> row = new LinkedHashMap<>();
          row.put("key", e.getKey());
          row.put("count", e.getValue());
          return row;
        })
        .toList();
  }
}
