package com.aikefu.session.domain;

import java.time.Instant;
import java.util.Map;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * 会话聚合根。
 *
 * <p>M1 内存仓储 + M2.5 起可切换到 MongoDB 文档(集合名 {@code sessions}),
 * 由 {@code aikefu.session.store} 决定使用哪种实现。
 *
 * <p>Mongo 注解仅在 store=mongo 时生效;InMemory 模式忽略它们。seq 自增源由
 * {@code SessionRepository.nextSeq} 接管(InMemory 用 AtomicLong map,Mongo 用
 * findAndModify);本类不再持有 seq 计数。
 */
@Document(collection = "sessions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Session {
  @Id String id;
  long tenantId;
  long userId;
  /** 接入渠道:web_h5 / app_webview / pc … */
  String channel;
  /** 状态机当前状态。 */
  SessionStatus status;
  /** 当前关联坐席,可空。 */
  Long agentId;
  /** 当前技能组,可空。 */
  Long skillGroupId;
  /** live_context 快照(直播 / 点播 业务上下文)。 */
  Map<String, Object> liveContext;
  Instant startedAt;
  Instant endedAt;
}
