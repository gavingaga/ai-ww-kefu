package com.aikefu.agentbff.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.aikefu.agentbff.audit.Auditor;
import com.aikefu.agentbff.clients.GatewayClient;
import com.aikefu.agentbff.clients.RoutingClient;
import com.aikefu.agentbff.clients.SessionClient;
import com.aikefu.agentbff.push.AgentEventBus;

/** 座席视角的聚合操作。所有错误都向上传播,由 controller 转译为 HTTP。 */
@Service
public class AgentService {

  private final RoutingClient routing;
  private final SessionClient session;
  private final AgentEventBus bus;
  private final GatewayClient gateway;
  private final Auditor auditor;

  public AgentService(
      RoutingClient routing,
      SessionClient session,
      AgentEventBus bus,
      GatewayClient gateway,
      Auditor auditor) {
    this.routing = routing;
    this.session = session;
    this.bus = bus;
    this.gateway = gateway;
    this.auditor = auditor;
  }

  /** 单元测试用 — 不强依赖 SSE 总线 / Gateway 推送 / 审计。 */
  public AgentService(RoutingClient routing, SessionClient session) {
    this(routing, session, new AgentEventBus(), new GatewayClient("", "", 1500), null);
  }

  public AgentService(RoutingClient routing, SessionClient session, AgentEventBus bus) {
    this(routing, session, bus, new GatewayClient("", "", 1500), null);
  }

  public AgentService(
      RoutingClient routing, SessionClient session, AgentEventBus bus, GatewayClient gateway) {
    this(routing, session, bus, gateway, null);
  }

  private void audit(
      String kind, Long actorId, String actorRole, String sessionId, String action) {
    if (auditor == null) return;
    auditor.log(kind, actorId, actorRole, sessionId, action);
  }

  private void audit(
      String kind,
      Long actorId,
      String actorRole,
      String sessionId,
      String target,
      String action,
      Map<String, Object> meta) {
    if (auditor == null) return;
    auditor.log(kind, actorId, actorRole, sessionId, target, action, meta);
  }

  private void inboxChanged(long... agentIds) {
    for (long id : agentIds) {
      bus.publish(id, "inbox-changed", Map.of("agent_id", id, "ts", System.currentTimeMillis()));
    }
  }

  /**
   * 把入库后的会话消息以 SSE 事件 {@code session-message} 推送给:
   * 发送方 + 当前承接坐席 + 所有观察该会话的主管。
   *
   * <p>消除 web-agent 当前会话的 4s 轮询,让坐席侧实时看到 reply / whisper / 用户消息。
   *
   * @param sessionId 目标会话
   * @param saved session-svc 入库后的 message
   * @param senderAgentId 发送方坐席 ID(可空,例如系统消息 / C 端消息)
   */
  private void publishSessionMessage(String sessionId, Map<String, Object> saved, Long senderAgentId) {
    if (sessionId == null || saved == null || saved.isEmpty()) return;
    java.util.Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("session_id", sessionId);
    payload.put("message", saved);
    payload.put("ts", System.currentTimeMillis());

    java.util.LinkedHashSet<Long> targets = new java.util.LinkedHashSet<>();
    if (senderAgentId != null && senderAgentId > 0) {
      targets.add(senderAgentId);
    }
    try {
      java.util.Map<String, java.util.List<Long>> agents = routing.agentsForSession(sessionId);
      targets.addAll(agents.getOrDefault("active", java.util.List.of()));
      targets.addAll(agents.getOrDefault("observers", java.util.List.of()));
    } catch (Exception ignored) {
      // 路由不可达不阻塞 push
    }
    for (Long id : targets) {
      bus.publish(id, "session-message", payload);
    }
  }

  /**
   * 外部服务(gateway-ws / ai-hub)反向通知 — 不带 senderAgentId,事件仅发给当前承接的坐席与
   * 观察该会话的主管。例如 C 端发出的消息由 gateway-ws 在 SessionRouter 落库后调本入口。
   */
  public void notifyExternalSessionMessage(String sessionId, Map<String, Object> message) {
    publishSessionMessage(sessionId, message, null);
  }

  /**
   * 把 session-svc 入库后的消息转成 WS 帧推到 gateway-ws,实时到达 C 端。
   *
   * @param sessionId 目标会话
   * @param saved session-svc 返回的 message 文档
   * @param fallbackRole 当 saved 中无 role 时使用的默认值(agent / system / ai)
   */
  private void pushToClient(String sessionId, Map<String, Object> saved, String fallbackRole) {
    if (sessionId == null || sessionId.isBlank() || saved == null || saved.isEmpty()) return;
    Map<String, Object> frame = new LinkedHashMap<>();
    String type = String.valueOf(saved.getOrDefault("type", "text"));
    frame.put("type", "msg." + type);
    Object msgId = saved.get("id");
    if (msgId != null) frame.put("msg_id", msgId);
    @SuppressWarnings("unchecked")
    Map<String, Object> content =
        saved.get("content") instanceof Map
            ? new LinkedHashMap<>((Map<String, Object>) saved.get("content"))
            : new LinkedHashMap<>();
    String role = String.valueOf(saved.getOrDefault("role", fallbackRole));
    content.putIfAbsent("role", role);
    if (saved.get("clientMsgId") != null) {
      content.putIfAbsent("client_msg_id", saved.get("clientMsgId"));
    }
    frame.put("payload", content);
    gateway.push(sessionId, frame);
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
    Object sid = r == null ? null : r.get("session_id");
    audit(
        "session.accept",
        agentId,
        "AGENT",
        sid == null ? null : String.valueOf(sid),
        entryId,
        "accept queue entry " + entryId,
        null);
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
    audit("session.close", agentId, "AGENT", sessionId, "agent close session");
    return Map.of("ok", true, "session_id", sessionId);
  }

  /** 转回 AI 托管(暂同 close + 由 ai-hub 重启会话);M3 末细化。 */
  public Map<String, Object> transferToAi(long agentId, String sessionId) {
    routing.release(agentId, sessionId);
    inboxChanged(agentId);
    audit("session.transfer_to_ai", agentId, "AGENT", sessionId, "transfer to AI");
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

  /** 坐席代发消息 — 落库 + 实时推到 C 端 WS + 通知坐席侧 SSE。 */
  public Map<String, Object> sendMessage(
      String sessionId, String idempotencyKey, Map<String, Object> body, Long senderAgentId) {
    Map<String, Object> saved = session.append(sessionId, idempotencyKey, body);
    pushToClient(sessionId, saved, "agent");
    publishSessionMessage(sessionId, saved, senderAgentId);
    return saved;
  }

  /** 兼容旧签名(没有 senderAgentId)— 不推 session-message。 */
  public Map<String, Object> sendMessage(
      String sessionId, String idempotencyKey, Map<String, Object> body) {
    return sendMessage(sessionId, idempotencyKey, body, null);
  }

  /** 注册 / 登录:坐席首次接入时往 routing 写一份。 */
  public Map<String, Object> registerOrUpdate(Map<String, Object> body) {
    return routing.registerAgent(body);
  }

  // ───── 主管干预(T-302) ─────

  public Map<String, Object> observe(long supervisorId, String sessionId) {
    Map<String, Object> r = routing.observe(supervisorId, sessionId);
    audit("supervisor.observe", supervisorId, "SUPERVISOR", sessionId, "observe");
    return r;
  }

  public Map<String, Object> unobserve(long supervisorId, String sessionId) {
    Map<String, Object> r = routing.unobserve(supervisorId, sessionId);
    audit("supervisor.unobserve", supervisorId, "SUPERVISOR", sessionId, "stop observe");
    return r;
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
    Map<String, Object> saved =
        session.append(
            sessionId, "whisper-" + supervisorId + "-" + System.currentTimeMillis(), body);
    pushToClient(sessionId, saved, "system");
    publishSessionMessage(sessionId, saved, supervisorId);
    audit(
        "supervisor.whisper",
        supervisorId,
        "SUPERVISOR",
        sessionId,
        null,
        "whisper",
        Map.of("text", text == null ? "" : (text.length() > 200 ? text.substring(0, 200) : text)));
    return saved;
  }

  /** 抢接 — 把会话从原坐席手中转给主管。 */
  public Map<String, Object> steal(long supervisorId, long fromAgentId, String sessionId) {
    Map<String, Object> r = routing.transfer(fromAgentId, supervisorId, sessionId);
    inboxChanged(supervisorId, fromAgentId);
    audit(
        "supervisor.steal",
        supervisorId,
        "SUPERVISOR",
        sessionId,
        String.valueOf(fromAgentId),
        "steal from " + fromAgentId,
        Map.of("from_agent_id", fromAgentId));
    return r;
  }

  /** 通用转接:agent → 另一个 agent / supervisor。 */
  public Map<String, Object> transfer(long fromAgentId, long toAgentId, String sessionId) {
    Map<String, Object> r = routing.transfer(fromAgentId, toAgentId, sessionId);
    inboxChanged(fromAgentId, toAgentId);
    audit(
        "supervisor.transfer",
        fromAgentId,
        "AGENT",
        sessionId,
        String.valueOf(toAgentId),
        "transfer to " + toAgentId,
        Map.of("from_agent_id", fromAgentId, "to_agent_id", toAgentId));
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
