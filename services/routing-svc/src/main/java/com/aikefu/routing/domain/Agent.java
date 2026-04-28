package com.aikefu.routing.domain;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/** 坐席。 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Agent {
  long id;
  String nickname;
  String avatarUrl;

  @Builder.Default AgentStatus status = AgentStatus.OFFLINE;

  /** 角色 — AGENT / SUPERVISOR(主管拥有监听 / 插话 / 抢接 权限)。 */
  @Builder.Default AgentRole role = AgentRole.AGENT;

  /** 该坐席覆盖的技能组(优先级高的优先分配)。 */
  @Builder.Default Set<String> skillGroups = new LinkedHashSet<>();

  /** 当前并行会话上限。 */
  @Builder.Default int maxConcurrency = 5;

  /** 当前承载的会话 ID 集合(由 RoutingService 维护)。 */
  @Builder.Default Set<String> activeSessionIds = new LinkedHashSet<>();

  /** 当前以"主管"身份正在观察的会话 ID 集合。 */
  @Builder.Default Set<String> observingSessionIds = new LinkedHashSet<>();

  /** 上次状态变更时间。 */
  Instant statusChangedAt;

  public int load() {
    return activeSessionIds == null ? 0 : activeSessionIds.size();
  }

  public boolean canTakeMore() {
    return status == AgentStatus.IDLE && load() < maxConcurrency;
  }
}
