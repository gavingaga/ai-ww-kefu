package com.aikefu.session.persistence;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.stereotype.Repository;

import com.aikefu.session.domain.Message;

/** M1 内存实现。 */
@Repository
public class InMemoryMessageRepository implements MessageRepository {

  /** sessionId → seq 排序消息 */
  private final ConcurrentMap<String, List<Message>> bySession = new ConcurrentHashMap<>();
  /** id → message */
  private final ConcurrentMap<String, Message> byId = new ConcurrentHashMap<>();
  /** (sessionId, clientMsgId) → message,实现幂等 */
  private final ConcurrentMap<String, Message> byIdempotency = new ConcurrentHashMap<>();

  @Override
  public synchronized Message saveIdempotent(Message m) {
    if (m.getClientMsgId() != null && !m.getClientMsgId().isEmpty()) {
      String key = idempotencyKey(m.getSessionId(), m.getClientMsgId());
      Message existed = byIdempotency.get(key);
      if (existed != null) return existed;
      byIdempotency.put(key, m);
    }
    byId.put(m.getId(), m);
    bySession
        .computeIfAbsent(m.getSessionId(), k -> new ArrayList<>())
        .add(m);
    return m;
  }

  @Override
  public List<Message> findHistory(String sessionId, long before, int limit) {
    List<Message> list = bySession.getOrDefault(sessionId, List.of());
    return list.stream()
        .filter(m -> before <= 0 || m.getSeq() < before)
        .sorted(Comparator.comparingLong(Message::getSeq).reversed())
        .limit(limit)
        .toList();
  }

  @Override
  public Optional<Message> findById(String id) {
    return Optional.ofNullable(byId.get(id));
  }

  private static String idempotencyKey(String sessionId, String clientMsgId) {
    return sessionId + ":" + clientMsgId;
  }
}
