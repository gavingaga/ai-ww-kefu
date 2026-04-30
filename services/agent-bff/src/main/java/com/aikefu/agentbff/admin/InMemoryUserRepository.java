package com.aikefu.agentbff.admin;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Repository;

/** 内存实现 — 进程级,重启丢;够 dev / 单机部署用。 */
@Repository
public class InMemoryUserRepository implements UserRepository {

  private final ConcurrentMap<Long, User> byId = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, Long> byUsername = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, Long> byEmail = new ConcurrentHashMap<>();
  private final AtomicLong seq = new AtomicLong(1000);

  @Override
  public synchronized User save(User u) {
    if (u.getId() == 0L) u.setId(seq.incrementAndGet());
    byId.put(u.getId(), u);
    if (u.getUsername() != null && !u.getUsername().isBlank()) {
      byUsername.put(u.getUsername().toLowerCase(), u.getId());
    }
    if (u.getEmail() != null && !u.getEmail().isBlank()) {
      byEmail.put(u.getEmail().toLowerCase(), u.getId());
    }
    return u;
  }

  @Override
  public Optional<User> findById(long id) {
    return Optional.ofNullable(byId.get(id));
  }

  @Override
  public Optional<User> findByUsername(String username) {
    if (username == null || username.isBlank()) return Optional.empty();
    Long id = byUsername.get(username.toLowerCase());
    return id == null ? Optional.empty() : Optional.ofNullable(byId.get(id));
  }

  @Override
  public Optional<User> findByEmail(String email) {
    if (email == null || email.isBlank()) return Optional.empty();
    Long id = byEmail.get(email.toLowerCase());
    return id == null ? Optional.empty() : Optional.ofNullable(byId.get(id));
  }

  @Override
  public Optional<User> findByIdentifier(String identifier) {
    if (identifier == null || identifier.isBlank()) return Optional.empty();
    String s = identifier.toLowerCase();
    Optional<User> u = findByUsername(s);
    if (u.isPresent()) return u;
    return findByEmail(s);
  }

  @Override
  public List<User> list(int offset, int limit) {
    int safeOffset = Math.max(0, offset);
    int safeLimit = Math.min(Math.max(limit, 1), 200);
    return byId.values().stream()
        .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
        .skip(safeOffset)
        .limit(safeLimit)
        .toList();
  }

  @Override
  public long count() {
    return byId.size();
  }
}
