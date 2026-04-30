package com.aikefu.routing.persistence;

import java.util.List;
import java.util.Optional;

import com.aikefu.routing.domain.SkillGroup;

public interface SkillGroupRepository {
  SkillGroup save(SkillGroup g);

  Optional<SkillGroup> findById(long id);

  Optional<SkillGroup> findByCode(String code);

  List<SkillGroup> list();

  /** 软删 — 把 active 置 false 而非物理移除,避免历史会话 / queue entry 反向解析失败。 */
  Optional<SkillGroup> deactivate(long id);
}
