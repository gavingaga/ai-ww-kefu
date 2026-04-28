package com.aikefu.notify.faq.web;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.notify.faq.domain.FaqNode;
import com.aikefu.notify.faq.domain.FaqTree;
import com.aikefu.notify.faq.match.MatchResult;
import com.aikefu.notify.faq.service.FaqService;

/** Visitor 侧 FAQ 端点(C 端 / ai-hub 共用)。 */
@RestController
@RequestMapping("/v1/faq")
public class FaqController {

  private final FaqService faq;

  public FaqController(FaqService faq) {
    this.faq = faq;
  }

  /** 拉取整树。scene=welcome / play / aftersale / membership ... */
  @GetMapping("/tree")
  public ResponseEntity<FaqTree> tree(@RequestParam(value = "scene", defaultValue = "welcome") String scene) {
    return faq.getTree(scene)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  /** 懒加载子节点 */
  @GetMapping("/node/{id}/children")
  public ResponseEntity<List<FaqNode>> children(@PathVariable("id") String id) {
    return ResponseEntity.ok(faq.getChildren(id));
  }

  /** 命中埋点。 */
  @PostMapping("/hit")
  public ResponseEntity<Void> hit(@RequestBody Map<String, Object> body) {
    String nodeId = (String) body.get("node_id");
    if (nodeId == null || nodeId.isBlank()) {
      return ResponseEntity.badRequest().build();
    }
    faq.recordHit(nodeId);
    return ResponseEntity.noContent().build();
  }

  /** ai-hub / 后台模拟器调用 — 输入一段 query,返回是否命中 + 哪个叶子 + 答案。 */
  @PostMapping("/match")
  public Map<String, Object> match(@RequestBody Map<String, Object> body) {
    String query = (String) body.getOrDefault("query", "");
    MatchResult m = faq.match(query);
    Map<String, Object> resp = new java.util.LinkedHashMap<>();
    resp.put("hit", m.isHit());
    resp.put("how", m.getHow());
    resp.put("score", m.getScore());
    if (m.isHit()) {
      resp.put("node_id", m.getNode().getId());
      resp.put("title", m.getNode().getTitle());
      resp.put("answer", m.getNode().getAnswer());
    }
    return resp;
  }
}
