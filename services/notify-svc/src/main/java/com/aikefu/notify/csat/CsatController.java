package com.aikefu.notify.csat;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 满意度评价(CSAT)— M3 起步内存存储,T-501 接 ClickHouse 物化视图。
 *
 * <p>客户端在收到 msg.csat 帧之后,提交评分:
 *
 * <pre>
 * POST /v1/csat
 * {
 *   "session_id": "ses_xxx",
 *   "rating": 1..5,
 *   "tags": ["响应快","专业"],
 *   "comment": "...",
 *   "actor": "user" | "agent"        // 默认 user
 * }
 * </pre>
 *
 * <p>30 秒内同 session_id 重新提交会覆盖之前一条(支持"撤回 + 重评")。
 */
@RestController
@RequestMapping("/v1/csat")
public class CsatController {

  /** 评价数量上限,防内存爆。 */
  private static final int MAX_ENTRIES = 5_000;

  /** 30 秒内可覆盖。 */
  private static final long REVISE_WINDOW_MS = 30_000L;

  private final Deque<Map<String, Object>> entries = new ArrayDeque<>();
  private final AtomicLong total = new AtomicLong();
  private final AtomicLong sumRating = new AtomicLong();

  @PostMapping
  public synchronized Map<String, Object> submit(@RequestBody Map<String, Object> body) {
    String sid = String.valueOf(body.getOrDefault("session_id", ""));
    int rating = clamp(asInt(body.get("rating")));
    if (sid.isBlank() || rating < 1) {
      throw new IllegalArgumentException("session_id 与 rating(1-5) 必填");
    }
    String comment = body.get("comment") == null ? null : String.valueOf(body.get("comment"));
    Object tagsRaw = body.get("tags");
    List<?> tags = tagsRaw instanceof List<?> l ? l : List.of();
    String actor = String.valueOf(body.getOrDefault("actor", "user"));
    Instant now = Instant.now();

    // 30s 内覆盖既有(撤回 + 重评)
    long cutoff = now.toEpochMilli() - REVISE_WINDOW_MS;
    entries.removeIf(
        e -> sid.equals(e.get("session_id")) && asLong(e.get("ts_ms")) >= cutoff);

    Map<String, Object> ev = new LinkedHashMap<>();
    ev.put("id", "csat_" + java.util.UUID.randomUUID().toString().replace("-", ""));
    ev.put("session_id", sid);
    ev.put("rating", rating);
    if (!tags.isEmpty()) ev.put("tags", List.copyOf(tags));
    if (comment != null && !comment.isBlank()) ev.put("comment", comment);
    ev.put("actor", actor);
    ev.put("ts", now.toString());
    ev.put("ts_ms", now.toEpochMilli());

    entries.addLast(ev);
    while (entries.size() > MAX_ENTRIES) entries.pollFirst();
    total.incrementAndGet();
    sumRating.addAndGet(rating);
    return ev;
  }

  /** 拉最近 N 条;ops 看板用。 */
  @GetMapping
  public synchronized Map<String, Object> list(
      @RequestParam(value = "limit", defaultValue = "50") int limit,
      @RequestParam(value = "session_id", required = false) String sessionId) {
    int safe = Math.min(Math.max(limit, 1), 500);
    List<Map<String, Object>> out = new java.util.ArrayList<>();
    var it = entries.descendingIterator();
    while (it.hasNext() && out.size() < safe) {
      Map<String, Object> e = it.next();
      if (sessionId != null && !sessionId.isBlank() && !sessionId.equals(e.get("session_id"))) continue;
      out.add(e);
    }
    long n = total.get();
    double avg = n == 0 ? 0.0 : (double) sumRating.get() / n;
    return Map.of(
        "items", out,
        "total", n,
        "avg_rating", avg);
  }

  private static int asInt(Object v) {
    if (v instanceof Number n) return n.intValue();
    if (v == null) return 0;
    try {
      return Integer.parseInt(String.valueOf(v));
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  private static long asLong(Object v) {
    if (v instanceof Number n) return n.longValue();
    return 0L;
  }

  private static int clamp(int v) {
    return Math.max(0, Math.min(5, v));
  }
}
