package com.aikefu.session.persistence.mongo;

import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import com.aikefu.session.domain.Session;
import com.aikefu.session.domain.SessionStatus;
import com.aikefu.session.persistence.SessionRepository;

/**
 * MongoDB 实现 — profile=mongo 且 aikefu.session.store=mongo 时启用。
 *
 * <p>seq 自增使用单独 collection {@code session_seq},通过 {@code findAndModify($inc seq)}
 * 在多实例并发下保证唯一顺序。Session 文档与 Message 文档分别存于 {@code sessions} / {@code messages}。
 */
@Repository
@Profile("mongo")
@ConditionalOnProperty(name = "aikefu.session.store", havingValue = "mongo")
public class MongoSessionRepository implements SessionRepository {

  private final MongoTemplate template;

  public MongoSessionRepository(MongoTemplate template) {
    this.template = template;
  }

  @Override
  public Session save(Session session) {
    return template.save(session);
  }

  @Override
  public Optional<Session> findById(String id) {
    return Optional.ofNullable(template.findById(id, Session.class));
  }

  @Override
  public Optional<Session> findCurrentByUser(long tenantId, long userId) {
    Query q =
        new Query(
                Criteria.where("tenantId").is(tenantId)
                    .and("userId").is(userId)
                    .and("status").ne(SessionStatus.CLOSED.name()))
            .with(Sort.by(Sort.Direction.DESC, "startedAt"))
            .limit(1);
    return Optional.ofNullable(template.findOne(q, Session.class));
  }

  @Override
  public java.util.List<Session> listByStatus(String status, int limit) {
    int safe = Math.min(Math.max(limit, 1), 200);
    Query q = new Query();
    if (status != null && !status.isBlank()) {
      try {
        q.addCriteria(Criteria.where("status").is(SessionStatus.valueOf(status.toUpperCase())));
      } catch (IllegalArgumentException ignored) {
        return java.util.List.of();
      }
    }
    q.with(Sort.by(Sort.Direction.DESC, "startedAt")).limit(safe);
    return template.find(q, Session.class);
  }

  @Override
  public long nextSeq(String sessionId) {
    Query q = Query.query(Criteria.where("_id").is(sessionId));
    Update u = new Update().inc("seq", 1L);
    SeqDoc updated =
        template.findAndModify(
            q,
            u,
            FindAndModifyOptions.options().upsert(true).returnNew(true),
            SeqDoc.class,
            "session_seq");
    return updated == null ? 1L : updated.seq;
  }

  /** session_seq 集合的简化文档结构。 */
  static class SeqDoc {
    String id;
    long seq;
  }
}
