package com.aikefu.agentbff.admin;

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

/**
 * 管理后台 / 坐席的统一用户档案。
 *
 * <p>「登录身份」与「业务档案」(Agent)分开:User 持密码哈希 + 角色,Agent 持坐席业务字段
 * (技能组 / 并发 / 状态)。两者通过 {@link User#agentId} 关联,可同时存在(坐席既登录又承接会话)。
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class User {
  long id;
  /** 用户名(唯一,小写,字母数字下划线)— 登录用,可空依靠 email。 */
  String username;
  /** 邮箱(唯一)— 登录用,可空但 username 与 email 至少一个非空。 */
  String email;
  /** 显示名,UI 展示;空则回落 username。 */
  String displayName;
  /** PBKDF2 哈希,见 {@link PasswordHasher}。 */
  String passwordHash;
  /** 角色集合(详见 {@link Role})。 */
  @Builder.Default Set<String> roles = new LinkedHashSet<>();
  /** 关联的 Agent.id;为 0 表示纯管理员,不承接会话。 */
  long agentId;
  /** 是否禁用 — 禁用后登录立即失败,旧 token 由 expiry 自然失效。 */
  boolean disabled;
  Instant createdAt;
  Instant lastLoginAt;
}
