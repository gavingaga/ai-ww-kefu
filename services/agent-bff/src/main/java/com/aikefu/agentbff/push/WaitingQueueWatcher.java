package com.aikefu.agentbff.push;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.aikefu.agentbff.clients.RoutingClient;

/**
 * 轮询 routing-svc 的 waiting 队列,变化时广播 inbox-changed。
 *
 * <p>背景:用户主动 handoff 走 ai-hub → routing-svc.enqueue,这条链路全程不经 agent-bff,
 * 因此没有上游主动通知 SSE。在没有 routing-svc → agent-bff 反向回调前,先用 3 秒轮询 +
 * entryId 集合 diff 的方式补齐 — 一旦队列条目集变化(新增 / 移除 / 顺序变),广播给所有
 * 当前订阅 SSE 的坐席,让他们 onInboxChanged 主动重拉一次 inbox。
 *
 * <p>3 秒的代价:稳态零变化时只多打一个 GET /v1/queue 请求,本进程内总线 broadcast 是 O(在线坐席数)。
 */
@Component
public class WaitingQueueWatcher {

  private static final Logger log = LoggerFactory.getLogger(WaitingQueueWatcher.class);

  private final RoutingClient routing;
  private final AgentEventBus bus;
  private final AtomicReference<Set<String>> lastIds =
      new AtomicReference<>(java.util.Collections.emptySet());

  public WaitingQueueWatcher(RoutingClient routing, AgentEventBus bus) {
    this.routing = routing;
    this.bus = bus;
  }

  @Scheduled(fixedDelayString = "${aikefu.agent-bff.waiting-watcher.delay-ms:3000}")
  public void tick() {
    Set<String> now = snapshotEntryIds();
    Set<String> prev = lastIds.getAndSet(now);
    if (prev.equals(now)) return;
    bus.broadcast(
        "inbox-changed",
        Map.of(
            "reason", "waiting_changed",
            "size", now.size(),
            "ts", System.currentTimeMillis()));
  }

  private Set<String> snapshotEntryIds() {
    try {
      List<Map<String, Object>> rows = routing.listQueue(null);
      if (rows == null) return java.util.Collections.emptySet();
      Set<String> ids = new LinkedHashSet<>(rows.size());
      for (Map<String, Object> r : rows) {
        Object id = r.get("id");
        if (id != null) ids.add(String.valueOf(id));
      }
      return ids;
    } catch (RuntimeException e) {
      log.debug("[waiting-watcher] poll failed: {}", e.toString());
      // 拉失败时保留上次值,下个 tick 再 diff,避免空 → 非空抖动产生假事件
      return lastIds.get();
    }
  }
}
