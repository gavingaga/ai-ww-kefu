package com.aikefu.session.persistence.mongo;

import java.util.List;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Repository;

import com.aikefu.session.domain.Message;
import com.aikefu.session.persistence.MessageRepository;

/** MongoDB 实现 — 索引 {@code (sessionId, seq desc)} 与 {@code (sessionId, clientMsgId) 唯一}。 */
@Repository
@Profile("mongo")
@ConditionalOnProperty(name = "aikefu.session.store", havingValue = "mongo")
public class MongoMessageRepository implements MessageRepository {

  private final MongoTemplate template;

  public MongoMessageRepository(MongoTemplate template) {
    this.template = template;
  }

  @Override
  public Message saveIdempotent(Message m) {
    if (m.getClientMsgId() != null && !m.getClientMsgId().isEmpty()) {
      // 先查同 (sessionId, clientMsgId);命中即返回旧记录(保证调用方拿到一致 seq/id)
      Message existed =
          template.findOne(
              Query.query(
                  Criteria.where("sessionId").is(m.getSessionId())
                      .and("clientMsgId").is(m.getClientMsgId())),
              Message.class);
      if (existed != null) return existed;
    }
    try {
      return template.insert(m);
    } catch (DuplicateKeyException ex) {
      // 并发竞态:再查一次拿已存在的那条
      Message existed =
          template.findOne(
              Query.query(
                  Criteria.where("sessionId").is(m.getSessionId())
                      .and("clientMsgId").is(m.getClientMsgId())),
              Message.class);
      if (existed != null) return existed;
      throw ex;
    }
  }

  @Override
  public List<Message> findHistory(String sessionId, long before, int limit) {
    Criteria c = Criteria.where("sessionId").is(sessionId);
    if (before > 0) c = c.and("seq").lt(before);
    Query q =
        new Query(c)
            .with(Sort.by(Sort.Direction.DESC, "seq"))
            .limit(Math.max(1, Math.min(limit, 100)));
    return template.find(q, Message.class);
  }

  @Override
  public List<Message> findSince(String sessionId, long since, int limit) {
    Criteria c = Criteria.where("sessionId").is(sessionId).and("seq").gt(since);
    Query q =
        new Query(c)
            .with(Sort.by(Sort.Direction.ASC, "seq"))
            .limit(Math.max(1, Math.min(limit, 200)));
    return template.find(q, Message.class);
  }

  @Override
  public Optional<Message> findById(String id) {
    return Optional.ofNullable(template.findById(id, Message.class));
  }
}
