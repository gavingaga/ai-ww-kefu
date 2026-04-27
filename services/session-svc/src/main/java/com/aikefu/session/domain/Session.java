package com.aikefu.session.domain;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/**
 * 会话聚合根。M1 内存表示,M2 起以 MongoDB 文档持久化。
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Session {
  String id;
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

  /** 会话内消息 seq 自增源(M1 内存,M2 由 MongoDB findAndModify 替代)。 */
  @Builder.Default AtomicLong seqCounter = new AtomicLong(0);

  /** 取下一个 seq。 */
  public long nextSeq() {
    return seqCounter.incrementAndGet();
  }
}
