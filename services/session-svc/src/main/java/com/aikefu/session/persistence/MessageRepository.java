package com.aikefu.session.persistence;

import java.util.List;
import java.util.Optional;

import com.aikefu.session.domain.Message;

/**
 * Message 仓储 — M1 内存实现。M2 起对接 MongoDB 分片(分片键 {tenant_id, session_id})。
 */
public interface MessageRepository {

  /**
   * 保存或返回已存在的同 (sessionId, clientMsgId) 消息(幂等)。
   *
   * @return 实际入库或已存在的消息
   */
  Message saveIdempotent(Message message);

  /** 获取会话历史,按 seq 倒序分页:取 seq < before 的最新 limit 条。 */
  List<Message> findHistory(String sessionId, long before, int limit);

  Optional<Message> findById(String id);
}
