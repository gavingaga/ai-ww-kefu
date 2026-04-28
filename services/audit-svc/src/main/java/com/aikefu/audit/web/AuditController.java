package com.aikefu.audit.web;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.audit.domain.AuditEvent;
import com.aikefu.audit.store.AuditStore;

/**
 * 审计端点 — M3 内网部署,无 token;后续接管理后台 ADMIN 角色 JWT。
 */
@RestController
@RequestMapping("/v1/audit")
public class AuditController {

  private final AuditStore store;

  public AuditController(AuditStore store) {
    this.store = store;
  }

  @GetMapping("/healthz")
  public Map<String, Object> healthz() {
    return Map.of("status", "ok", "size", store.size(), "capacity", store.capacity());
  }

  @PostMapping("/events")
  public AuditEvent append(@RequestBody AuditEvent ev) {
    return store.append(ev);
  }

  @GetMapping("/events")
  public Map<String, Object> query(
      @RequestParam(value = "kind", required = false) String kind,
      @RequestParam(value = "actor_id", required = false) Long actorId,
      @RequestParam(value = "session_id", required = false) String sessionId,
      @RequestParam(value = "since", required = false) String since,
      @RequestParam(value = "limit", defaultValue = "100") int limit) {
    Instant sinceTs = parseInstant(since);
    List<AuditEvent> items = store.query(kind, actorId, sessionId, sinceTs, limit);
    return Map.of(
        "items", items,
        "size", store.size(),
        "capacity", store.capacity());
  }

  private static Instant parseInstant(String raw) {
    if (raw == null || raw.isBlank()) return null;
    try {
      // 接受 ISO-8601 或纯毫秒
      if (raw.matches("\\d+")) {
        return Instant.ofEpochMilli(Long.parseLong(raw));
      }
      return Instant.parse(raw);
    } catch (Exception ignored) {
      return null;
    }
  }
}
