package com.aikefu.routing.domain;

import java.time.Instant;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/**
 * 技能组实体 — 给路由分配 + 报表口径用。code 是 wire 主键(ai-hub / web 双方都用 code),
 * id 仅作内部排序与 admin UI 操作锚点。
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SkillGroup {
  long id;
  /** 短代号(英文小写,字母数字下划线)— 与 wire format 一致,锁定不可改。 */
  String code;
  /** 显示名 — admin UI 展示。 */
  String name;
  String description;
  /** 父技能组 code — overflow / fallback 链;空表示根。 */
  String parentCode;
  /** 优先级 — 数字越小越优先(类似 nice 值);默认 100。 */
  @Builder.Default int priority = 100;
  /** SLA 秒,达到后视为超时,可触发主管告警 / 上溢父组。 */
  @Builder.Default int slaSeconds = 180;
  @Builder.Default boolean active = true;
  Instant createdAt;
  Instant updatedAt;
}
