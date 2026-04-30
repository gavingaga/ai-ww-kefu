package com.aikefu.agentbff.admin;

import java.util.List;
import java.util.Optional;

/** User 持久化接口 — 起步内存实现,后续可换 Mongo。 */
public interface UserRepository {

  User save(User user);

  Optional<User> findById(long id);

  Optional<User> findByUsername(String username);

  Optional<User> findByEmail(String email);

  /** 按 username 或 email 任一匹配 — 登录入口用。 */
  Optional<User> findByIdentifier(String identifier);

  List<User> list(int offset, int limit);

  long count();
}
