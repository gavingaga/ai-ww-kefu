package com.aikefu.agentbff.admin;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** User 业务层 — 统一密码 hash / 唯一性校验 / 启动 seed owner。 */
@Service
public class UserService {

  private static final Logger log = LoggerFactory.getLogger(UserService.class);

  private final UserRepository repo;
  private final PasswordHasher hasher;
  private final String bootstrapUsername;
  private final String bootstrapPassword;
  private final String bootstrapEmail;

  public UserService(
      UserRepository repo,
      PasswordHasher hasher,
      @Value("${aikefu.admin.bootstrap.username:admin}") String bootstrapUsername,
      @Value("${aikefu.admin.bootstrap.password:admin}") String bootstrapPassword,
      @Value("${aikefu.admin.bootstrap.email:admin@local}") String bootstrapEmail) {
    this.repo = repo;
    this.hasher = hasher;
    this.bootstrapUsername = bootstrapUsername;
    this.bootstrapPassword = bootstrapPassword;
    this.bootstrapEmail = bootstrapEmail;
  }

  /** 启动 seed:若库内 0 用户,创建 owner。dev 默认 admin/admin,生产需通过 env 注入随机密码。 */
  @PostConstruct
  public void seed() {
    if (repo.count() > 0) return;
    User owner = User.builder()
        .username(bootstrapUsername)
        .email(bootstrapEmail)
        .displayName("Owner")
        .passwordHash(hasher.hash(bootstrapPassword))
        .roles(new LinkedHashSet<>(List.of(Role.OWNER)))
        .createdAt(Instant.now())
        .build();
    repo.save(owner);
    log.warn("[admin-seed] 创建初始 owner username={} (dev 默认密码 admin/admin,生产改 ADMIN_BOOTSTRAP_PASSWORD env)",
        bootstrapUsername);
  }

  public Optional<User> authenticate(String identifier, String password) {
    if (identifier == null || password == null) return Optional.empty();
    Optional<User> u = repo.findByIdentifier(identifier);
    if (u.isEmpty() || u.get().isDisabled()) return Optional.empty();
    if (!hasher.verify(password, u.get().getPasswordHash())) return Optional.empty();
    User user = u.get();
    user.setLastLoginAt(Instant.now());
    repo.save(user);
    return Optional.of(user);
  }

  public User get(long id) {
    return repo.findById(id).orElseThrow(() -> new UserNotFound(id));
  }

  public List<User> list(int offset, int limit) {
    return repo.list(offset, limit);
  }

  /** 创建 — 校验唯一,自动 hash 密码。 */
  public User create(
      String username,
      String email,
      String displayName,
      String plainPassword,
      Set<String> roles,
      long agentId) {
    if ((username == null || username.isBlank()) && (email == null || email.isBlank())) {
      throw new IllegalArgumentException("username 或 email 至少一个非空");
    }
    if (username != null && repo.findByUsername(username).isPresent()) {
      throw new IllegalArgumentException("username 已存在: " + username);
    }
    if (email != null && repo.findByEmail(email).isPresent()) {
      throw new IllegalArgumentException("email 已存在: " + email);
    }
    User u = User.builder()
        .username(username)
        .email(email)
        .displayName(displayName)
        .passwordHash(hasher.hash(plainPassword == null || plainPassword.isBlank()
            ? PasswordHasher.randomPassword(12)
            : plainPassword))
        .roles(roles == null ? new LinkedHashSet<>(List.of(Role.AGENT)) : new LinkedHashSet<>(roles))
        .agentId(agentId)
        .createdAt(Instant.now())
        .build();
    return repo.save(u);
  }

  /** 改密码(需要旧密码,管理员重置走 {@link #adminResetPassword})。 */
  public void changePassword(long userId, String oldPassword, String newPassword) {
    User u = get(userId);
    if (!hasher.verify(oldPassword, u.getPasswordHash())) {
      throw new IllegalArgumentException("旧密码不正确");
    }
    u.setPasswordHash(hasher.hash(newPassword));
    repo.save(u);
  }

  public String adminResetPassword(long userId) {
    User u = get(userId);
    String fresh = PasswordHasher.randomPassword(12);
    u.setPasswordHash(hasher.hash(fresh));
    repo.save(u);
    return fresh;
  }

  public User setDisabled(long userId, boolean disabled) {
    User u = get(userId);
    u.setDisabled(disabled);
    return repo.save(u);
  }

  public User setRoles(long userId, Set<String> roles) {
    User u = get(userId);
    u.setRoles(roles == null ? new LinkedHashSet<>() : new LinkedHashSet<>(roles));
    return repo.save(u);
  }

  /** 公开视图(脱敏 passwordHash)。 */
  public Map<String, Object> view(User u) {
    Map<String, Object> v = new java.util.LinkedHashMap<>();
    v.put("id", u.getId());
    v.put("username", u.getUsername());
    v.put("email", u.getEmail());
    v.put("displayName", u.getDisplayName());
    v.put("roles", u.getRoles());
    v.put("agentId", u.getAgentId());
    v.put("disabled", u.isDisabled());
    v.put("createdAt", u.getCreatedAt());
    v.put("lastLoginAt", u.getLastLoginAt());
    return v;
  }

  public static class UserNotFound extends RuntimeException {
    public UserNotFound(long id) {
      super("user not found: " + id);
    }
  }
}
