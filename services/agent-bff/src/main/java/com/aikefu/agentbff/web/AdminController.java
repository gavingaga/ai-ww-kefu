package com.aikefu.agentbff.web;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.agentbff.clients.KbClient;
import com.aikefu.agentbff.clients.NotifyClient;
import com.aikefu.agentbff.clients.RoutingClient;

/**
 * 管理后台 — 透传 kb-svc 等下游服务的只读 / 调试端点,避免前端直连。
 *
 * <p>M3 末加 JWT + 角色 (ADMIN / SUPERVISOR) 鉴权;当前仅在内网部署,沿用网关层 IP 白名单。
 */
@RestController
@RequestMapping("/v1/admin")
public class AdminController {

  private final KbClient kb;
  private final NotifyClient notify;
  private final RoutingClient routing;

  public AdminController(KbClient kb, NotifyClient notify, RoutingClient routing) {
    this.kb = kb;
    this.notify = notify;
    this.routing = routing;
  }

  // ───── 运营看板 ─────

  @GetMapping("/dashboard")
  public Map<String, Object> dashboard() {
    return routing.dashboard();
  }

  @GetMapping("/stats")
  public Map<String, Object> stats() {
    return routing.stats();
  }

  // ───── KB ─────

  @GetMapping("/kb/stats")
  public Map<String, Object> kbStats() {
    return kb.stats();
  }

  @PostMapping("/kb/debug/search")
  public Map<String, Object> kbDebugSearch(@RequestBody Map<String, Object> body) {
    return kb.debugSearch(body);
  }

  @PostMapping("/kb/match")
  public Map<String, Object> kbMatch(@RequestBody Map<String, Object> body) {
    return kb.match(body);
  }

  @PostMapping("/kb/ingest")
  public Map<String, Object> kbIngest(@RequestBody Map<String, Object> body) {
    return kb.ingest(body);
  }

  // ───── FAQ(管理) ─────

  @GetMapping("/faq/trees")
  public List<Map<String, Object>> faqTrees() {
    return notify.faqTrees();
  }

  @PutMapping("/faq/trees")
  public Map<String, Object> faqSaveTree(@RequestBody Map<String, Object> tree) {
    return notify.saveFaqTree(tree);
  }

  @PostMapping("/faq/preview")
  public Map<String, Object> faqPreview(@RequestBody Map<String, Object> body) {
    return notify.faqPreview(body);
  }
}
