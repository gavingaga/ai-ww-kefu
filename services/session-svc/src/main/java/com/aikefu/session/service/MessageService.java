package com.aikefu.session.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.aikefu.session.domain.Message;
import com.aikefu.session.persistence.MessageRepository;
import com.aikefu.session.persistence.SessionRepository;

/** 消息写入与历史查询。客户端 (sessionId, clientMsgId) 唯一约束做幂等。 */
@Service
public class MessageService {

  private final MessageRepository repo;
  private final SessionService sessionService;
  private final SessionRepository sessionRepo;

  public MessageService(
      MessageRepository repo,
      SessionService sessionService,
      SessionRepository sessionRepo) {
    this.repo = repo;
    this.sessionService = sessionService;
    this.sessionRepo = sessionRepo;
  }

  /**
   * 写入一条消息。如果同 (sessionId, clientMsgId) 已存在,直接返回旧记录,不重复入库。
   *
   * @param sessionId 会话 ID
   * @param clientMsgId 客户端消息 ID(可空,但 user/agent 强烈建议带)
   * @param role user / ai / agent / system
   * @param type text / image / file / card / faq / system
   * @param content 消息内容字段(text / url / size 等)
   * @param aiMeta 仅 AI 角色填,可空
   * @return 入库后的 Message
   */
  public Message append(
      String sessionId,
      String clientMsgId,
      String role,
      String type,
      Map<String, Object> content,
      Map<String, Object> aiMeta) {
    sessionService.getById(sessionId); // 校验存在
    long seq = sessionRepo.nextSeq(sessionId);
    Message m =
        Message.builder()
            .id("msg_" + UUID.randomUUID().toString().replace("-", ""))
            .sessionId(sessionId)
            .seq(seq)
            .clientMsgId(clientMsgId)
            .role(role)
            .type(type)
            .content(content)
            .status("sent")
            .createdAt(Instant.now())
            .aiMeta(aiMeta)
            .build();
    return repo.saveIdempotent(m);
  }

  /** 历史分页:取 seq < before 的最近 limit 条。 */
  public List<Message> history(String sessionId, long before, int limit) {
    return repo.findHistory(sessionId, before, limit);
  }
}
