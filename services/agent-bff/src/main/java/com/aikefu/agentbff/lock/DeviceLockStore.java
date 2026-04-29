package com.aikefu.agentbff.lock;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.aikefu.agentbff.push.AgentEventBus;

/**
 * 同坐席多设备互斥 — 每个 agent 同一时刻只允许一个设备(deviceId)持有锁。
 *
 * <p>锁过期 = TTL 内无心跳;新设备访问时若锁已过期或同 device,放行;若有效且不同 device,
 * 允许"抢占" — 给旧设备 SSE 推 {@code device-evicted} 事件,旧 UI 应自动退出。
 */
@Component
public class DeviceLockStore {

  private final Duration ttl;
  private final AgentEventBus bus;
  private final ConcurrentMap<Long, Holder> holders = new ConcurrentHashMap<>();

  public DeviceLockStore(
      AgentEventBus bus,
      @Value("${aikefu.device-lock.ttl-seconds:15}") int ttlSeconds) {
    this.bus = bus;
    this.ttl = Duration.ofSeconds(Math.max(5, ttlSeconds));
  }

  /**
   * 心跳 / 抢占。
   *
   * @return 1) 同 device → {ok:true, holder=device, evicted:null}
   *         2) 旧锁失效 / 不存在 → 设新 device,{ok:true, evicted:null}
   *         3) 旧锁有效 + 新 device → 抢占,推 device-evicted 给旧;{ok:true, evicted=oldDevice}
   */
  public Map<String, Object> heartbeat(long agentId, String deviceId) {
    if (deviceId == null || deviceId.isBlank()) {
      return Map.of("ok", false, "error", "deviceId required");
    }
    Instant now = Instant.now();
    Holder cur = holders.get(agentId);
    if (cur == null || cur.expired(now, ttl)) {
      holders.put(agentId, new Holder(deviceId, now));
      return Map.of("ok", true, "holder", deviceId, "evicted", "");
    }
    if (cur.deviceId.equals(deviceId)) {
      cur.ts = now;
      return Map.of("ok", true, "holder", deviceId, "evicted", "");
    }
    String old = cur.deviceId;
    holders.put(agentId, new Holder(deviceId, now));
    bus.publish(
        agentId,
        "device-evicted",
        Map.of("agent_id", agentId, "evicted_device", old, "new_device", deviceId, "ts", now.toEpochMilli()));
    return Map.of("ok", true, "holder", deviceId, "evicted", old);
  }

  public boolean isHolder(long agentId, String deviceId) {
    Holder h = holders.get(agentId);
    if (h == null || h.expired(Instant.now(), ttl)) return false;
    return h.deviceId.equals(deviceId);
  }

  public Map<String, Object> snapshot(long agentId) {
    Holder h = holders.get(agentId);
    if (h == null) return Map.of("agent_id", agentId, "holder", "", "ts_ms", 0);
    return Map.of(
        "agent_id", agentId,
        "holder", h.deviceId,
        "ts_ms", h.ts.toEpochMilli(),
        "expires_in_sec", Math.max(0, ttl.minus(Duration.between(h.ts, Instant.now())).getSeconds()));
  }

  public void release(long agentId, String deviceId) {
    holders.computeIfPresent(agentId, (k, v) -> v.deviceId.equals(deviceId) ? null : v);
  }

  static final class Holder {
    final String deviceId;
    Instant ts;

    Holder(String deviceId, Instant ts) {
      this.deviceId = deviceId;
      this.ts = ts;
    }

    boolean expired(Instant now, Duration ttl) {
      return now.isAfter(ts.plus(ttl));
    }
  }
}
