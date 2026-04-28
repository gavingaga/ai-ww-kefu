package com.aikefu.notify.faq.web;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.notify.faq.domain.FaqTree;
import com.aikefu.notify.faq.match.MatchResult;
import com.aikefu.notify.faq.service.FaqService;

/**
 * 管理后台用的 FAQ 端点 — M2 起步先放在 /admin 路径,后续接 RBAC + 审计。
 */
@RestController
@RequestMapping("/admin/v1/faq")
public class AdminFaqController {

  private final FaqService faq;

  public AdminFaqController(FaqService faq) {
    this.faq = faq;
  }

  @GetMapping("/trees")
  public List<FaqTree> all() {
    return faq.all();
  }

  /** 整树覆盖式更新(简化版本;后续 T-214 实现拖拽节点级粒度)。 */
  @PutMapping("/trees")
  public ResponseEntity<FaqTree> save(@RequestBody FaqTree tree) {
    if (tree.getScene() == null || tree.getScene().isBlank()) {
      return ResponseEntity.badRequest().build();
    }
    return ResponseEntity.ok(faq.saveTree(tree));
  }

  /** 模拟器:输入 query,返回决策结果。 */
  @PostMapping("/preview")
  public Map<String, Object> preview(@RequestBody Map<String, Object> body) {
    String query = (String) body.getOrDefault("query", "");
    MatchResult m = faq.match(query);
    Map<String, Object> resp = new java.util.LinkedHashMap<>();
    resp.put("hit", m.isHit());
    resp.put("how", m.getHow());
    resp.put("score", m.getScore());
    if (m.isHit()) {
      resp.put("node_id", m.getNode().getId());
      resp.put("title", m.getNode().getTitle());
      resp.put("hits", faq.hitCount(m.getNode().getId()));
    }
    return resp;
  }

  /** 节点命中累计(数据面初版)。 */
  @GetMapping("/hits/{nodeId}")
  public Map<String, Object> hitsOf(@PathVariable("nodeId") String nodeId) {
    return Map.of("node_id", nodeId, "hits", faq.hitCount(nodeId));
  }
}
