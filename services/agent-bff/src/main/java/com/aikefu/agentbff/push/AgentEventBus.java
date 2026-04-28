package com.aikefu.agentbff.push;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArraySet;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 进程内 SSE 总线 — 按 ``agentId`` 维护一组 emitter。
 *
 * <p>M3 起步只在单进程有效;M3 末若多副本部署,需要把 publish 经过 Redis Pub/Sub 广播到全部
 * 副本(同 gateway-ws 跨节点 dispatch 的思路)。
 */
@Component
public class AgentEventBus {

  private static final Logger log = LoggerFactory.getLogger(AgentEventBus.class);

  private final ConcurrentMap<Long, CopyOnWriteArraySet<SseEmitter>> byAgent =
      new ConcurrentHashMap<>();

  /** 注册一个 emitter,绑定到 agentId;返回 emitter 本身供 controller 直接使用。 */
  public SseEmitter subscribe(long agentId, long timeoutMs) {
    SseEmitter emitter = new SseEmitter(timeoutMs);
    byAgent.computeIfAbsent(agentId, k -> new CopyOnWriteArraySet<>()).add(emitter);
    Runnable cleanup =
        () -> {
          var bucket = byAgent.get(agentId);
          if (bucket != null) {
            bucket.remove(emitter);
            if (bucket.isEmpty()) byAgent.remove(agentId);
          }
        };
    emitter.onCompletion(cleanup);
    emitter.onTimeout(cleanup);
    emitter.onError(t -> cleanup.run());
    try {
      emitter.send(SseEmitter.event().name("hello").data(Map.of("agent_id", agentId)));
    } catch (IOException e) {
      log.debug("hello send failed for agent={}", agentId, e);
    }
    return emitter;
  }

  /** 推送 named 事件到该 agentId 的全部订阅者(失败的 emitter 会被自动剔除)。 */
  public void publish(long agentId, String name, Object data) {
    var bucket = byAgent.get(agentId);
    if (bucket == null || bucket.isEmpty()) return;
    for (SseEmitter emitter : bucket) {
      try {
        emitter.send(SseEmitter.event().name(name).data(data));
      } catch (IOException ex) {
        // emitter 已断开;onError 会触发清理,这里也补一次显式 complete
        try {
          emitter.completeWithError(ex);
        } catch (Exception ignored) {
          // ignore
        }
        bucket.remove(emitter);
      }
    }
  }

  /** 同一份 data 同时投递给多个 agentId(用于会话事件:坐席本人 + 全部观察者)。 */
  public void publishMany(Iterable<Long> agentIds, String name, Object data) {
    for (Long id : agentIds) {
      if (id != null) publish(id, name, data);
    }
  }

  public int subscriberCount(long agentId) {
    var bucket = byAgent.get(agentId);
    return bucket == null ? 0 : bucket.size();
  }
}
