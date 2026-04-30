package com.aikefu.agentbff.push;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.aikefu.agentbff.clients.RoutingClient;
import com.aikefu.agentbff.service.AgentService;

/**
 * 周期性对账:防 routing-svc 内存中的 agent.activeSessionIds 累积孤儿。
 *
 * <p>register / setStatus(IDLE) 已会触发一次,但若 close 路径漏 release(网络抖动 /
 * 服务挂了 / 跨节点消息丢)、且坐席长时间没有 IDLE 切换,routing 那边会把 maxConcurrency
 * 压满,后续 accept 直接 409。30s 一次扫描全部已注册坐席,把 session 已 CLOSED / 不存在
 * 的 entry 释放掉。
 */
@Component
public class AgentLoadReconciler {

  private static final Logger log = LoggerFactory.getLogger(AgentLoadReconciler.class);

  private final RoutingClient routing;
  private final AgentService agents;

  public AgentLoadReconciler(RoutingClient routing, AgentService agents) {
    this.routing = routing;
    this.agents = agents;
  }

  @Scheduled(
      initialDelayString = "${aikefu.agent-bff.reconcile.initial-delay-ms:30000}",
      fixedDelayString = "${aikefu.agent-bff.reconcile.delay-ms:30000}")
  public void tick() {
    List<Map<String, Object>> all;
    try {
      all = routing.listAgents();
    } catch (RuntimeException e) {
      log.debug("[reconcile-tick] listAgents failed: {}", e.toString());
      return;
    }
    if (all == null || all.isEmpty()) return;
    for (Map<String, Object> a : all) {
      Object idObj = a.get("id");
      if (!(idObj instanceof Number n)) continue;
      // 只对承载会话的坐席跑;空载没必要
      Object active = a.get("activeSessionIds");
      if (!(active instanceof java.util.Collection<?> c) || c.isEmpty()) continue;
      try {
        agents.reconcileAgentLoad(n.longValue());
      } catch (RuntimeException ignored) {
        // 单个坐席失败不阻塞其它
      }
    }
  }
}
