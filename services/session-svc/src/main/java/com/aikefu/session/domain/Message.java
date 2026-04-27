package com.aikefu.session.domain;

import java.time.Instant;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 会话消息。
 *
 * <p>{@code clientMsgId} 用于客户端发送的幂等保护;{@code seq} 用于客户端去重 / 顺序保证。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Message {
  private String id;
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
