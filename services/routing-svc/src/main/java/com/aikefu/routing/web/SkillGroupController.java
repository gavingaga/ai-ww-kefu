package com.aikefu.routing.web;

import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.routing.domain.SkillGroup;
import com.aikefu.routing.persistence.SkillGroupRepository;

@RestController
@RequestMapping("/v1/skill-groups")
public class SkillGroupController {

  private final SkillGroupRepository repo;

  public SkillGroupController(SkillGroupRepository repo) {
    this.repo = repo;
  }

  @GetMapping
  public List<SkillGroup> list() {
    return repo.list();
  }

  @GetMapping("/{id}")
  public ResponseEntity<SkillGroup> get(@PathVariable("id") long id) {
    return repo.findById(id).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
  }

  @PostMapping
  public ResponseEntity<SkillGroup> create(@RequestBody SkillGroup g) {
    g.setId(0L); // 强制新建
    try {
      return ResponseEntity.status(HttpStatus.CREATED).body(repo.save(g));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.status(HttpStatus.CONFLICT).build();
    }
  }

  /** 编辑 — code 一旦签发不允许改(避免 wire 上下游错位);允许改 name/description/priority/sla 等。 */
  @PutMapping("/{id}")
  public ResponseEntity<SkillGroup> update(@PathVariable("id") long id, @RequestBody SkillGroup body) {
    Optional<SkillGroup> cur = repo.findById(id);
    if (cur.isEmpty()) return ResponseEntity.notFound().build();
    SkillGroup g = cur.get();
    if (body.getName() != null) g.setName(body.getName());
    if (body.getDescription() != null) g.setDescription(body.getDescription());
    if (body.getParentCode() != null) g.setParentCode(body.getParentCode().isBlank() ? null : body.getParentCode());
    if (body.getPriority() != 0) g.setPriority(body.getPriority());
    if (body.getSlaSeconds() != 0) g.setSlaSeconds(body.getSlaSeconds());
    // active 显式覆盖(包括传 false)
    g.setActive(body.isActive());
    return ResponseEntity.ok(repo.save(g));
  }

  /** 软删 — 仅置 active=false,保留历史引用。 */
  @DeleteMapping("/{id}")
  public ResponseEntity<SkillGroup> deactivate(@PathVariable("id") long id) {
    return repo.deactivate(id)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }
}
