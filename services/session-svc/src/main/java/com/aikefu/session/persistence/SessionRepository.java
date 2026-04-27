package com.aikefu.session.persistence;

import java.util.Optional;

import com.aikefu.session.domain.Session;

/**
 * Session 仓储接口。M1 内存实现 {@link InMemorySessionRepository},M2 用 MongoDB 实现替换。
 */
public interface SessionRepository {

  Session save(Session session);

  Optional<Session> findById(String id);

  Optional<Session> findCurrentByUser(long tenantId, long userId);
}
