package com.aikefu.agentbff.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.aikefu.agentbff.clients.RoutingClient;
import com.aikefu.agentbff.clients.SessionClient;
import com.aikefu.agentbff.push.AgentEventBus;

/** 座席视角的聚合操作。所有错误都向上传播,由 controller 转译为 HTTP。 */
@Service
public class AgentService {

  private final RoutingClient routing;
  private final SessionClient session;
  private final AgentEventBus bus;

  public AgentService(RoutingClient routing, SessionClient session, AgentEventBus bus) {
    this.routing = routing;
    this.session = session;
    this.bus = bus;
  }

  /** 单元测试用 — 不强依赖 SSE 总线。 */
  public AgentService(RoutingClient routing, SessionClient session) {
    this(routing, session, new AgentEventBus());
  }

  private void inboxChanged(long... agentIds) {
    for (long id : agentIds) {
      bus.publish(id, "inbox-changed", Map.of("agent_id", id, "ts", System.currentTimeMillis()));
    }
  }

  /** 收件箱:待接队列(按坐席技能组过滤)+ 当前进行中会话快照。 */
  public Map<String, Object> inbox(long agentId) {
    Map<String, Object> agent = routing.getAgent(agentId);
    @SuppressWarnings("unchecked")
    List<String> groups = (List<String>) agent.getOrDefault("skillGroups", List.of());
    @SuppressWarnings("unchecked")
    java.util.Set<String> activeIds = new java.util.LinkedHashSet<>(
        ((java.util.Collection<String>) agent.getOrDefault("activeSessionIds", List.of())));

    // 队列:跨多个技能组合并(转 set 去重)
    List<Map<String, Object>> waiting = new java.util.ArrayList<>();
    java.util.Set<String> seen = new java.util.HashSet<>();
    for (String g : groups) {
      try {
        for (Map<String, Object> e : routing.listQueue(g)) {
          String id = String.valueOf(e.get("id"));
          if (seen.add(id)) waiting.add(e);
        }
      } catch (Exception ex) {
        // 忽略单个 group 失败,不阻塞其它
      }
    }

    // 进行中会话:补充 session-svc 信息(history 由 web-agent 选中后再拉)
    List<Map<String, Object>> active = new java.util.ArrayList<>();
    for (String sid : activeIds) {
      try {
        active.add(session.session(sid));
      } catch (Exception ex) {
        // 会话已结束 / 跨节点等导致 404,忽略
      }
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("agent", agent);
    out.put("waiting", waiting);
    out.put("active", active);
    return out;
  }

  /** 接受派单:routing.assign + (TODO) session.attachAgent + 状态推 IN_AGENT。
   *
   * <p>session-svc 在 M2 起步只暴露状态机跃迁的隐式 API(由 ai-hub 触发);M3
   * 真实接入后这里需要再调 session.attachAgent。当前先打 routing.assign 完成派单。
   */
  public Map<String, Object> accept(long agentId, String entryId) {
    Map<String, Object> r = routing.assign(agentId, entryId);
    inboxChanged(agentId);
    return r;
  }

  /** 结束:释放 routing 占用 + 关闭会话状态。 */
  public Map<String, Object> close(long agentId, String sessionId) {
    routing.release(agentId, sessionId);
    try {
      session.close(sessionId);
    } catch (Exception ex) {
      // session 可能已 closed,这里幂等忽略
    }
    inboxChanged(agentId);
    return Map.of("ok", true, "session_id", sessionId);
  }

  /** 转回 AI 托管(暂同 close + 由 ai-hub 重启会话);M3 末细化。 */
  public Map<String, Object> transferToAi(long agentId, String sessionId) {
    routing.release(agentId, sessionId);
    inboxChanged(agentId);
    return Map.of("ok", true, "session_id", sessionId, "transferred", "ai");
  }

  /** 取一条派单候选(不抢占)。 */
  public Map<String, Object> peek(long agentId) {
    return routing.peek(agentId);
  }

  /** 上下行同步:更新坐席状态。 */
  public Map<String, Object> setStatus(long agentId, String status) {
    Map<String, Object> r = routing.setStatus(agentId, status);
    inboxChanged(agentId);
    return r;
  }

  /** 历史消息分页代理。 */
  public Map<String, Object> messages(String sessionId, long before, int limit) {
    return session.messages(sessionId, before, Math.max(1, Math.min(limit, 100)));
  }

  /** 坐席代发消息。 */
  public Map<String, Object> sendMessage(
      String sessionId, String idempotencyKey, Map<String, Object> body) {
    return session.append(sessionId, idempotencyKey, body);
  }

  /** 注册 / 登录:坐席首次接入时往 routing 写一份。 */
  public Map<String, Object> registerOrUpdate(Map<String, Object> body) {
    return routing.registerAgent(body);
  }

  // ───── 主管干预(T-302) ─────

  public Map<String, Object> observe(long supervisorId, String sessionId) {
    return routing.observe(supervisorId, sessionId);
  }

  public Map<String, Object> unobserve(long supervisorId, String sessionId) {
    return routing.unobserve(supervisorId, sessionId);
  }

  /**
   * 主管插话 — 以 system 角色 + sub=supervisor 写一条消息;坐席与用户都能看到,
   * AI 不会基于此再次调用工具。
   */
  public Map<String, Object> whisper(long supervisorId, String sessionId, String text) {
    Map<String, Object> body = new java.util.LinkedHashMap<>();
    body.put("type", "system");
    body.put("role", "system");
    body.put("content", Map.of("text", text, "sub", "supervisor"));
    body.put("aiMeta", Map.of("supervisor_id", supervisorId, "kind", "whisper"));
    return session.append(
        sessionId, "whisper-" + supervisorId + "-" + System.currentTimeMillis(), body);
  }

  /** 抢接 — 把会话从原坐席手中转给主管。 */
  public Map<String, Object> steal(long supervisorId, long fromAgentId, String sessionId) {
    Map<String, Object> r = routing.transfer(fromAgentId, supervisorId, sessionId);
    inboxChanged(supervisorId, fromAgentId);
    return r;
  }

  /** 通用转接:agent → 另一个 agent / supervisor。 */
  public Map<String, Object> transfer(long fromAgentId, long toAgentId, String sessionId) {
    Map<String, Object> r = routing.transfer(fromAgentId, toAgentId, sessionId);
    inboxChanged(fromAgentId, toAgentId);
    return r;
  }

  public java.util.List<Map<String, Object>> supervisors() {
    return routing.supervisors();
  }

  /** 主管视图 — 直接转发 routing.dashboard。 */
  public Map<String, Object> dashboard() {
    return routing.dashboard();
  }
}
