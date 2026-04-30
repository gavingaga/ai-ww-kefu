package com.aikefu.routing.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Repository;

import com.aikefu.routing.domain.SkillGroup;

@Repository
public class InMemorySkillGroupRepository implements SkillGroupRepository {

  private final ConcurrentMap<Long, SkillGroup> byId = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, Long> byCode = new ConcurrentHashMap<>();
  private final AtomicLong seq = new AtomicLong(0);

  @PostConstruct
  public void seed() {
    if (!byId.isEmpty()) return;
    Instant now = Instant.now();
    saveInternal(SkillGroup.builder().code("general").name("通用").description("通用问题首选")
        .priority(100).slaSeconds(180).active(true).createdAt(now).updatedAt(now).build());
    saveInternal(SkillGroup.builder().code("play_tech").name("播放技术").description("卡顿 / 清晰度 / 播放器问题")
        .parentCode("general").priority(50).slaSeconds(120).active(true).createdAt(now).updatedAt(now).build());
    saveInternal(SkillGroup.builder().code("membership_payment").name("会员支付")
        .description("订单 / 续费 / 退款").parentCode("general").priority(30).slaSeconds(120).active(true)
        .createdAt(now).updatedAt(now).build());
    saveInternal(SkillGroup.builder().code("vip").name("VIP 优先").description("VIP 客户专线")
        .priority(10).slaSeconds(60).active(true).createdAt(now).updatedAt(now).build());
  }

  private SkillGroup saveInternal(SkillGroup g) {
    if (g.getId() == 0L) g.setId(seq.incrementAndGet());
    byId.put(g.getId(), g);
    if (g.getCode() != null) byCode.put(g.getCode(), g.getId());
    return g;
  }

  @Override
  public synchronized SkillGroup save(SkillGroup g) {
    if (g.getCode() == null || g.getCode().isBlank()) {
      throw new IllegalArgumentException("code required");
    }
    if (g.getId() == 0L) {
      // 新增前唯一性校验
      if (byCode.containsKey(g.getCode())) {
        throw new IllegalArgumentException("code 已存在: " + g.getCode());
      }
      g.setCreatedAt(Instant.now());
    }
    g.setUpdatedAt(Instant.now());
    return saveInternal(g);
  }

  @Override
  public Optional<SkillGroup> findById(long id) {
    return Optional.ofNullable(byId.get(id));
  }

  @Override
  public Optional<SkillGroup> findByCode(String code) {
    if (code == null) return Optional.empty();
    Long id = byCode.get(code);
    return id == null ? Optional.empty() : Optional.ofNullable(byId.get(id));
  }

  @Override
  public List<SkillGroup> list() {
    return byId.values().stream()
        .sorted((a, b) -> {
          int p = Integer.compare(a.getPriority(), b.getPriority());
          return p != 0 ? p : Long.compare(a.getId(), b.getId());
        })
        .toList();
  }

  @Override
  public synchronized Optional<SkillGroup> deactivate(long id) {
    SkillGroup g = byId.get(id);
    if (g == null) return Optional.empty();
    g.setActive(false);
    g.setUpdatedAt(Instant.now());
    return Optional.of(g);
  }
}
