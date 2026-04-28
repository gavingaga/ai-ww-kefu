package com.aikefu.routing.domain;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 排队条目 — 每个 handoff 进入队列时生成一条。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QueueEntry {
  private String id;
  private String sessionId;
  private long tenantId;

  /** 由 ai-hub 推算的目标技能组(可被覆盖)。 */
  private String skillGroup;

  /** packet 透传字段(structure 与 ai-hub HandoffPacket 一致)。 */
  @Builder.Default private Map<String, Object> packet = new HashMap<>();

  /** 入队时间。 */
  private Instant enqueuedAt;

  /** 数字越小越优先,默认 100。 */
  @Builder.Default private int priority = 100;

  /** 当 enqueuedAt 距今 > overflowSeconds 时,可被溢出到上级技能组(由 RoutingService 主调)。 */
  @Builder.Default private boolean overflowed = false;

  public Object reason() {
    return packet.get("reason");
  }

  public Object userLevel() {
    Object u = packet.get("user");
    if (u instanceof Map) {
      return ((Map<?, ?>) u).get("level");
    }
    return null;
  }

  public boolean isVip() {
    Object l = userLevel();
    return l != null && String.valueOf(l).toLowerCase().startsWith("vip");
  }
}
