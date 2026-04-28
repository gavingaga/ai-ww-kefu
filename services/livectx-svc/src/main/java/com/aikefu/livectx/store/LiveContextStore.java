package com.aikefu.livectx.store;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * LiveContext 内存存储 — LRU + TTL。M3 起步;后续接 Redis 不影响 API。
 *
 * <p>键策略:
 *
 * <ul>
 *   <li>{@code room:<room_id>} — 直播间(scene=live_room)
 *   <li>{@code vod:<vod_id>}   — 点播(scene=vod_detail)
 *   <li>{@code u:<uid>}        — 用户最近一次上报(用于跨场景挂回)
 * </ul>
 *
 * <p>SDK 上报到来时,按 scene 写入对应键。AI 中枢按 (scene, room_id|vod_id) 反查。
 */
@Component
public class LiveContextStore {

  private final Duration ttl;
  private final int maxEntries;
  private final LinkedHashMap<String, Entry> cache;

  public LiveContextStore(
      @Value("${aikefu.livectx.ttl-seconds:120}") int ttlSeconds,
      @Value("${aikefu.livectx.max-entries:5000}") int maxEntries) {
    this.ttl = Duration.ofSeconds(Math.max(5, ttlSeconds));
    this.maxEntries = Math.max(100, maxEntries);
    this.cache = new LinkedHashMap<>(256, 0.75f, true) {
      @Override
      protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) {
        return size() > LiveContextStore.this.maxEntries;
      }
    };
  }

  public synchronized Map<String, Object> upsert(String key, Map<String, Object> value) {
    Map<String, Object> snapshot = value == null ? Map.of() : Map.copyOf(value);
    cache.put(key, new Entry(snapshot, Instant.now()));
    return snapshot;
  }

  /** 取值;过期则同时清理。 */
  public synchronized Map<String, Object> get(String key) {
    Entry e = cache.get(key);
    if (e == null) return null;
    if (Instant.now().isAfter(e.ts.plus(ttl))) {
      cache.remove(key);
      return null;
    }
    return e.value;
  }

  public synchronized int size() {
    return cache.size();
  }

  public synchronized int capacity() {
    return maxEntries;
  }

  public Duration ttl() {
    return ttl;
  }

  private record Entry(Map<String, Object> value, Instant ts) {}
}
