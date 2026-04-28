package com.aikefu.agentbff.web;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.aikefu.agentbff.push.AgentEventBus;

/**
 * 座席侧 SSE 端点 — 用于实时推送 inbox-changed 等事件。
 *
 * <p>EventSource 不支持自定义 header,因此 agentId 从 query 参数读取。M3 末换 JWT 时
 * 改为短期一次性 token(由 /v1/agent/sse-ticket 颁发)。
 */
@RestController
@RequestMapping("/v1/agent")
public class EventStreamController {

  private static final Logger log = LoggerFactory.getLogger(EventStreamController.class);

  private final AgentEventBus bus;
  private final ScheduledExecutorService scheduler;

  public EventStreamController(AgentEventBus bus) {
    this.bus = bus;
    this.scheduler = Executors.newScheduledThreadPool(1, r -> {
      Thread t = new Thread(r, "agent-bff-sse-heartbeat");
      t.setDaemon(true);
      return t;
    });
  }

  @PostConstruct
  void onStart() {
    // 每 25s 给所有订阅者发一次心跳事件,防 NAT / 反代连接超时
    scheduler.scheduleAtFixedRate(this::heartbeatAll, 25, 25, TimeUnit.SECONDS);
  }

  @PreDestroy
  void onShutdown() {
    scheduler.shutdownNow();
  }

  @GetMapping(path = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter events(@RequestParam("agent_id") long agentId) {
    long timeoutMs = 30 * 60 * 1000L; // 30min;客户端 EventSource 自动重连
    return bus.subscribe(agentId, timeoutMs);
  }

  private void heartbeatAll() {
    try {
      // bus 内部会过滤已断开;publish 是按 agentId 发,我们这里不知道全部 agentId,
      // 因此只针对最近活跃的 agent 发。简化:让 bus 自己暴露 keys 也可以,这里直接广播策略。
      // M3 起步用 hello 模式,只在订阅时发一次 hello;心跳交给反代/keepalive 处理。
      // 这里保留入口以便后续替换。
    } catch (Exception e) {
      log.debug("heartbeat failed", e);
    }
  }

  /** 提供给运维 / 单测的 inline test 推送。 */
  @GetMapping("/_debug/push")
  public Map<String, Object> debugPush(
      @RequestParam("agent_id") long agentId,
      @RequestParam(value = "name", defaultValue = "debug") String name) {
    bus.publish(agentId, name, Map.of("hello", "world"));
    return Map.of("ok", true, "subscribers", bus.subscriberCount(agentId));
  }

  /** 向 emitter 写一个 keepalive comment,与 SseEmitter 自带不冲突;预留备用。 */
  @SuppressWarnings("unused")
  private static void keepalive(SseEmitter e) {
    try {
      e.send(SseEmitter.event().comment("ka"));
    } catch (IOException ignored) {
      // ignore
    }
  }
}
