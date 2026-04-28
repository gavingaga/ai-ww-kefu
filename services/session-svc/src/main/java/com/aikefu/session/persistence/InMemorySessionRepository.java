package com.aikefu.session.persistence;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import com.aikefu.session.domain.Session;
import com.aikefu.session.domain.SessionStatus;

/**
 * 内存实现 — 仅本节点可见,适合开发与单测。
 *
 * <p>通过 {@code aikefu.session.store=memory}(默认)启用;切换为 {@code mongo} 时
 * 由 {@code MongoSessionRepository} 接管。
 */
@Repository
@ConditionalOnProperty(name = "aikefu.session.store", havingValue = "memory", matchIfMissing = true)
public class InMemorySessionRepository implements SessionRepository {

  private final ConcurrentMap<String, Session> byId = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, String> currentByUser = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, AtomicLong> seqs = new ConcurrentHashMap<>();

  @Override
  public Session save(Session session) {
    byId.put(session.getId(), session);
    if (!session.getStatus().isTerminal()) {
      currentByUser.put(userKey(session.getTenantId(), session.getUserId()), session.getId());
    } else {
      // 移除"current"指针,避免下次 getCurrent 拿到已结束的会话
      currentByUser.computeIfPresent(
          userKey(session.getTenantId(), session.getUserId()),
          (k, v) -> v.equals(session.getId()) ? null : v);
    }
    return session;
  }

  @Override
  public Optional<Session> findById(String id) {
    return Optional.ofNullable(byId.get(id));
  }

  @Override
  public Optional<Session> findCurrentByUser(long tenantId, long userId) {
    String id = currentByUser.get(userKey(tenantId, userId));
    if (id == null) return Optional.empty();
    Session s = byId.get(id);
    if (s == null || s.getStatus() == SessionStatus.CLOSED) return Optional.empty();
    return Optional.of(s);
  }

  @Override
  public long nextSeq(String sessionId) {
    return seqs.computeIfAbsent(sessionId, k -> new AtomicLong()).incrementAndGet();
  }

  private static String userKey(long tenantId, long userId) {
    return tenantId + ":" + userId;
  }
}
