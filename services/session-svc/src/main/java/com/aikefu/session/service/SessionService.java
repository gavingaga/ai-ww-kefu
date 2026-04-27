package com.aikefu.session.service;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Service;

import com.aikefu.session.domain.Session;
import com.aikefu.session.domain.SessionStatus;
import com.aikefu.session.persistence.SessionRepository;

/** 会话生命周期入口。 */
@Service
public class SessionService {

  private final SessionRepository repo;
  private final SessionStateMachine stateMachine;

  public SessionService(SessionRepository repo, SessionStateMachine stateMachine) {
    this.repo = repo;
    this.stateMachine = stateMachine;
  }

  /** 取或开会话:若用户当前无 active 会话,则创建一个 AI 会话。 */
  public Session getOrCreateCurrent(
      long tenantId, long userId, String channel, Map<String, Object> liveContext) {
    return repo.findCurrentByUser(tenantId, userId)
        .orElseGet(
            () ->
                repo.save(
                    Session.builder()
                        .id("ses_" + UUID.randomUUID().toString().replace("-", ""))
                        .tenantId(tenantId)
                        .userId(userId)
                        .channel(channel == null ? "web_h5" : channel)
                        .status(SessionStatus.AI)
                        .liveContext(liveContext)
                        .startedAt(Instant.now())
                        .seqCounter(new AtomicLong(0))
                        .build()));
  }

  public Session getById(String id) {
    return repo.findById(id).orElseThrow(() -> new SessionNotFoundException(id));
  }

  /** 状态跃迁,返回更新后的会话。 */
  public Session transition(String id, SessionStatus to) {
    Session s = getById(id);
    stateMachine.check(s.getStatus(), to);
    s.setStatus(to);
    if (to.isTerminal()) {
      s.setEndedAt(Instant.now());
    }
    return repo.save(s);
  }

  /** 更新 live_context(切清晰度 / 换房间 / 卡顿事件触发)。 */
  public Session updateLiveContext(String id, Map<String, Object> liveContext) {
    Session s = getById(id);
    s.setLiveContext(liveContext);
    return repo.save(s);
  }

  /** 设置坐席关联(IN_AGENT 状态使用)。 */
  public Session attachAgent(String id, long agentId, long skillGroupId) {
    Session s = getById(id);
    s.setAgentId(agentId);
    s.setSkillGroupId(skillGroupId);
    return repo.save(s);
  }

  /** 会话不存在异常,统一 404。 */
  public static class SessionNotFoundException extends RuntimeException {
    public SessionNotFoundException(String id) {
      super("session not found: " + id);
    }
  }
}
