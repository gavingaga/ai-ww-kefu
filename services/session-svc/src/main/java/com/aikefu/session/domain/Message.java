package com.aikefu.session.domain;

import java.time.Instant;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * 会话消息。
 *
 * <p>{@code clientMsgId} 用于客户端发送的幂等保护;{@code seq} 用于客户端去重 / 顺序保证。
 *
 * <p>Mongo 集合 {@code messages},分片键(M3 末)/常用索引:
 *
 * <ul>
 *   <li>(sessionId, seq) — 历史分页主索引,降序使用
 *   <li>(sessionId, clientMsgId) — 幂等唯一索引,由 MongoConfig 启动时确保
 * </ul>
 */
@Document(collection = "messages")
@CompoundIndexes({
  @CompoundIndex(name = "msg_session_seq", def = "{'sessionId': 1, 'seq': -1}"),
  @CompoundIndex(
      name = "msg_session_cmid",
      def = "{'sessionId': 1, 'clientMsgId': 1}",
      unique = true,
      sparse = true)
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Message {
  @Id private String id;
  private String sessionId;
  private long seq;
  private String clientMsgId;
  /** user / ai / agent / system */
  private String role;
  /** text / image / file / card / faq / system */
  private String type;
  private Map<String, Object> content;
  /** sent / delivered / read / recalled */
  private String status;
  private Instant createdAt;
  /** AI 元数据(model / tokens / latency 等),可空。 */
  private Map<String, Object> aiMeta;
}
