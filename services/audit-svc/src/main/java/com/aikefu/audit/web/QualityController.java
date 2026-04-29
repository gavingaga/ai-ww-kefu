package com.aikefu.audit.web;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.audit.domain.AuditEvent;
import com.aikefu.audit.store.AuditStore;

/**
 * 质检模块 — 抽样会话 + 录入评分。
 *
 * <p>抽样:从内存 audit 中按 sessionId 去重,随机 N 个;评分写入独立 map,以 sessionId 为键。
 */
@RestController
@RequestMapping("/v1/audit/quality")
public class QualityController {

  private final AuditStore store;
  private final ConcurrentMap<String, Map<String, Object>> reviews = new ConcurrentHashMap<>();

  public QualityController(AuditStore store) {
    this.store = store;
  }

  /** 抽样 — 返回最近 audit 出现过的 N 个 session_id。 */
  @GetMapping("/sample")
  public Map<String, Object> sample(@RequestParam(value = "n", defaultValue = "10") int n) {
    int safe = Math.min(Math.max(n, 1), 50);
    List<AuditEvent> items = store.query(null, null, null, null, 500);
    java.util.LinkedHashSet<String> sids = new java.util.LinkedHashSet<>();
    for (AuditEvent ev : items) {
      if (ev.getSessionId() != null && !ev.getSessionId().isBlank()) {
        sids.add(ev.getSessionId());
      }
    }
    List<String> all = new ArrayList<>(sids);
    Collections.shuffle(all);
    return Map.of("sample", all.stream().limit(safe).toList(), "pool_size", all.size());
  }

  /** 录入评分:rating 1~5 + 评分卡 dimensions(响应快/专业度/合规)+ 备注。 */
  @PostMapping("/score")
  public Map<String, Object> score(@RequestBody Map<String, Object> body) {
    String sid = String.valueOf(body.getOrDefault("session_id", ""));
    if (sid.isBlank()) throw new IllegalArgumentException("session_id required");
    int rating = ((Number) body.getOrDefault("rating", 0)).intValue();
    rating = Math.max(0, Math.min(5, rating));
    Map<String, Object> dims =
        body.get("dimensions") instanceof Map<?, ?> m
            ? new LinkedHashMap<>(asObjMap(m))
            : Map.of();
    String comment = body.get("comment") == null ? "" : String.valueOf(body.get("comment"));
    long reviewer = ((Number) body.getOrDefault("reviewer_id", 0)).longValue();
    Map<String, Object> review = new LinkedHashMap<>();
    review.put("id", "qa_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
    review.put("session_id", sid);
    review.put("rating", rating);
    review.put("dimensions", dims);
    review.put("comment", comment);
    review.put("reviewer_id", reviewer);
    review.put("ts", Instant.now().toString());
    reviews.put(sid, review);
    // 同步落 audit-svc 总账,kind=quality.review 便于后续报表统计
    store.append(
        AuditEvent.builder()
            .kind("quality.review")
            .actor(AuditEvent.Actor.builder().id(reviewer == 0 ? null : reviewer).role("ADMIN").build())
            .sessionId(sid)
            .action("score=" + rating)
            .meta(review)
            .build());
    return review;
  }

  @GetMapping("/reviews")
  public List<Map<String, Object>> list() {
    return new ArrayList<>(reviews.values());
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asObjMap(Map<?, ?> m) {
    return (Map<String, Object>) m;
  }
}
