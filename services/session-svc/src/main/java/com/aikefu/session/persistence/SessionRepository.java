package com.aikefu.session.persistence;

import java.util.Optional;

import com.aikefu.session.domain.Session;

/**
 * Session 仓储接口。
 *
 * <p>支持两种实现:M1 内存 {@link InMemorySessionRepository}、M2.5 MongoDB 实现
 * {@code MongoSessionRepository}(profile=mongo 时启用)。
 */
public interface SessionRepository {

  Session save(Session session);

  Optional<Session> findById(String id);

  Optional<Session> findCurrentByUser(long tenantId, long userId);

  /**
   * 按状态枚举过滤,startedAt 倒序最多 limit 条;status=null 返全部。
   * 坐席台「AI 托管会话」板块用 status="ai" 拉。
   */
  java.util.List<Session> listByStatus(String status, int limit);

  /**
   * 取下一条消息的会话内 seq。
   *
   * <p>InMemory 实现用 {@code ConcurrentMap<String, AtomicLong>};Mongo 实现走
   * {@code findAndModify($inc seq)} 单文档原子更新,保证多实例并发下顺序唯一。
   */
  long nextSeq(String sessionId);
}
