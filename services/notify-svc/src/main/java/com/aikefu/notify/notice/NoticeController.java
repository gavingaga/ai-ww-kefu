package com.aikefu.notify.notice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 公告(Announcement)+ 快捷按钮(QuickReply)CRUD — M3 内存版,后续接 Mongo。
 */
@RestController
@RequestMapping("/v1")
public class NoticeController {

  private final ConcurrentMap<String, Map<String, Object>> announcements = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, Map<String, Object>> quickReplies = new ConcurrentHashMap<>();

  public NoticeController() {
    seed();
  }

  private void seed() {
    save(announcements, Map.of(
        "id", "ann_default_1",
        "level", "critical",
        "content", "直播间 8001 当前正在抢修,工程师已介入,预计 5 分钟内恢复",
        "active", true));
    save(announcements, Map.of(
        "id", "ann_default_2",
        "level", "info",
        "content", "新版客服上线:多级常见问题,叶子节点直达答案,无需排队",
        "active", true));
    save(quickReplies, Map.of(
        "id", "qr_play",
        "label", "我看视频卡顿",
        "payload", "我看视频卡顿,帮我看一下",
        "scene", "play",
        "icon", "📡",
        "active", true));
    save(quickReplies, Map.of(
        "id", "qr_handoff",
        "label", "联系人工",
        "payload", "转人工",
        "scene", "handoff",
        "icon", "👤",
        "active", true));
  }

  // ───── Announcement ─────

  @GetMapping("/announcements")
  public List<Map<String, Object>> listAnnouncements() {
    return List.copyOf(announcements.values());
  }

  @PostMapping("/announcements")
  public Map<String, Object> createAnnouncement(@RequestBody Map<String, Object> body) {
    return save(announcements, body);
  }

  @PutMapping("/announcements/{id}")
  public ResponseEntity<Map<String, Object>> updateAnnouncement(
      @PathVariable("id") String id, @RequestBody Map<String, Object> body) {
    if (!announcements.containsKey(id)) return ResponseEntity.notFound().build();
    Map<String, Object> next = new LinkedHashMap<>(body);
    next.put("id", id);
    next.put("updated_at", Instant.now().toString());
    announcements.put(id, next);
    return ResponseEntity.ok(next);
  }

  @DeleteMapping("/announcements/{id}")
  public ResponseEntity<Void> deleteAnnouncement(@PathVariable("id") String id) {
    return announcements.remove(id) == null
        ? ResponseEntity.notFound().build()
        : ResponseEntity.noContent().build();
  }

  // ───── QuickReply ─────

  @GetMapping("/quick-replies")
  public List<Map<String, Object>> listQuickReplies() {
    return List.copyOf(quickReplies.values());
  }

  @PostMapping("/quick-replies")
  public Map<String, Object> createQuickReply(@RequestBody Map<String, Object> body) {
    return save(quickReplies, body);
  }

  @PutMapping("/quick-replies/{id}")
  public ResponseEntity<Map<String, Object>> updateQuickReply(
      @PathVariable("id") String id, @RequestBody Map<String, Object> body) {
    if (!quickReplies.containsKey(id)) return ResponseEntity.notFound().build();
    Map<String, Object> next = new LinkedHashMap<>(body);
    next.put("id", id);
    next.put("updated_at", Instant.now().toString());
    quickReplies.put(id, next);
    return ResponseEntity.ok(next);
  }

  @DeleteMapping("/quick-replies/{id}")
  public ResponseEntity<Void> deleteQuickReply(@PathVariable("id") String id) {
    return quickReplies.remove(id) == null
        ? ResponseEntity.notFound().build()
        : ResponseEntity.noContent().build();
  }

  // ───── 点击数据回流 ─────

  private final java.util.concurrent.ConcurrentMap<String, java.util.concurrent.atomic.AtomicLong> clickCounts =
      new java.util.concurrent.ConcurrentHashMap<>();

  /** 点击计数 — 后续接 report-svc 入湖,这里先内存累计。 */
  @org.springframework.web.bind.annotation.PostMapping("/quick-replies/{id}/click")
  public Map<String, Object> clickQuickReply(
      @PathVariable("id") String id, @RequestBody(required = false) Map<String, Object> body) {
    long n =
        clickCounts
            .computeIfAbsent(id, k -> new java.util.concurrent.atomic.AtomicLong())
            .incrementAndGet();
    return Map.of("ok", true, "id", id, "count", n, "scene", body == null ? "" : body.getOrDefault("scene", ""));
  }

  @org.springframework.web.bind.annotation.GetMapping("/quick-replies/clicks")
  public Map<String, Long> clickStats() {
    Map<String, Long> out = new java.util.LinkedHashMap<>();
    clickCounts.forEach((k, v) -> out.put(k, v.get()));
    return out;
  }

  // ───── helpers ─────

  private static Map<String, Object> save(
      ConcurrentMap<String, Map<String, Object>> store, Map<String, Object> body) {
    Map<String, Object> next = new LinkedHashMap<>(body);
    String id =
        body.get("id") == null
            ? "ent_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12)
            : String.valueOf(body.get("id"));
    next.put("id", id);
    next.putIfAbsent("created_at", Instant.now().toString());
    next.put("updated_at", Instant.now().toString());
    store.put(id, next);
    return next;
  }
}
