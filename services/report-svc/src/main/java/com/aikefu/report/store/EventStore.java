package com.aikefu.report.store;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 事件入湖(M3 内存版,M5 接 ClickHouse / Kafka)。 */
@Component
public class EventStore {

  private final int capacity;
  private final Deque<Map<String, Object>> ring = new ArrayDeque<>();

  public EventStore(@Value("${aikefu.report.buffer-size:50000}") int capacity) {
    this.capacity = Math.max(1000, capacity);
  }

  public synchronized Map<String, Object> append(Map<String, Object> raw) {
    Map<String, Object> ev = new LinkedHashMap<>(raw == null ? Map.of() : raw);
    ev.computeIfAbsent("id", k -> "ev_" + UUID.randomUUID().toString().replace("-", ""));
    ev.computeIfAbsent("ts", k -> Instant.now().toString());
    ev.computeIfAbsent("ts_ms", k -> System.currentTimeMillis());
    ring.addLast(ev);
    while (ring.size() > capacity) ring.pollFirst();
    return ev;
  }

  public synchronized List<Map<String, Object>> snapshot() {
    return List.copyOf(ring);
  }

  public synchronized int size() {
    return ring.size();
  }

  public int capacity() {
    return capacity;
  }
}
