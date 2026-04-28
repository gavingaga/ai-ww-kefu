package com.aikefu.audit.store;

import java.time.Instant;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.aikefu.audit.domain.AuditEvent;

/**
 * 内存环形 buffer — M3 起步;后续接 Mongo / ClickHouse 不影响 API。
 *
 * <p>插入按时间顺序追加;超出容量丢弃最老一条。读取以最新优先逆序返回。
 */
@Component
public class AuditStore {

  private final int capacity;
  private final Deque<AuditEvent> ring = new ArrayDeque<>();

  public AuditStore(@Value("${aikefu.audit.buffer-size:5000}") int capacity) {
    this.capacity = Math.max(100, capacity);
  }

  public synchronized AuditEvent append(AuditEvent ev) {
    if (ev.getId() == null || ev.getId().isBlank()) {
      ev.setId("au_" + UUID.randomUUID().toString().replace("-", ""));
    }
    if (ev.getTs() == null) ev.setTs(Instant.now());
    ring.addLast(ev);
    while (ring.size() > capacity) {
      ring.pollFirst();
    }
    return ev;
  }

  public synchronized List<AuditEvent> query(
      String kind, Long actorId, String sessionId, Instant since, int limit) {
    int safeLimit = Math.min(Math.max(limit, 1), 500);
    List<AuditEvent> out = new ArrayList<>();
    // 倒序遍历,最新优先
    var it = ring.descendingIterator();
    while (it.hasNext() && out.size() < safeLimit) {
      AuditEvent ev = it.next();
      if (since != null && ev.getTs() != null && ev.getTs().isBefore(since)) break;
      if (kind != null && !kind.isBlank() && !kind.equalsIgnoreCase(ev.getKind())) continue;
      if (actorId != null
          && (ev.getActor() == null || !actorId.equals(ev.getActor().getId()))) continue;
      if (sessionId != null
          && !sessionId.isBlank()
          && !sessionId.equals(ev.getSessionId())) continue;
      out.add(ev);
    }
    return out;
  }

  public synchronized int size() {
    return ring.size();
  }

  public synchronized int capacity() {
    return capacity;
  }
}
