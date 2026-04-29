package com.aikefu.agentbff.web;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.agentbff.clients.AuditClient;
import com.aikefu.agentbff.clients.KbClient;
import com.aikefu.agentbff.clients.NotifyClient;
import com.aikefu.agentbff.clients.ReportClient;
import com.aikefu.agentbff.clients.RoutingClient;
import com.aikefu.agentbff.clients.ToolClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

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
  private final AuditClient audit;
  private final ReportClient report;
  private final ToolClient toolClient;

  public AdminController(
      KbClient kb,
      NotifyClient notify,
      RoutingClient routing,
      AuditClient audit,
      ReportClient report,
      ToolClient toolClient) {
    this.kb = kb;
    this.notify = notify;
    this.routing = routing;
    this.audit = audit;
    this.report = report;
    this.toolClient = toolClient;
  }

  // ───── 工具调试器 ─────

  @GetMapping("/tools")
  public java.util.List<Map<String, Object>> listTools() {
    return toolClient.list();
  }

  @PostMapping("/tools/{name}/invoke")
  public Map<String, Object> adminInvokeTool(
      @PathVariable("name") String name, @RequestBody Map<String, Object> body) {
    return toolClient.invoke(name, body);
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

  @GetMapping("/kb/docs")
  public Map<String, Object> kbListDocs() {
    return kb.listDocs();
  }

  @DeleteMapping("/kb/docs/{id}")
  public Map<String, Object> kbDeleteDoc(@PathVariable("id") String docId) {
    return kb.deleteDoc(docId);
  }

  @PostMapping("/kb/docs/{id}/reindex")
  public Map<String, Object> kbReindexDoc(@PathVariable("id") String docId) {
    return kb.reindexDoc(docId);
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

  // ───── 登录(M3 mock) ─────

  /**
   * 极简登录:
   * <ul>
   *   <li>username 含 "admin" → role=ADMIN
   *   <li>username 含 "supervisor" 或 "sup" → role=SUPERVISOR
   *   <li>其它 → role=AGENT
   *   <li>password 任意非空即过(M3 起步,后续接 SSO / OIDC)
   * </ul>
   */
  @PostMapping("/login")
  public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, Object> body) {
    String u = String.valueOf(body.getOrDefault("username", "")).trim().toLowerCase();
    String p = String.valueOf(body.getOrDefault("password", ""));
    if (u.isEmpty() || p.isEmpty()) {
      return ResponseEntity.status(401).body(Map.of("error", "username/password required"));
    }
    String role = u.contains("admin") ? "ADMIN" : (u.contains("sup") ? "SUPERVISOR" : "AGENT");
    String token = "mock_" + Long.toHexString(System.currentTimeMillis()) + "_" + u;
    return ResponseEntity.ok(
        Map.of(
            "ok", true,
            "token", token,
            "user", Map.of("username", u, "role", role)));
  }

  // ───── 公告 / 快捷按钮 ─────

  @GetMapping("/announcements")
  public List<Map<String, Object>> announcements() {
    return notify.announcements();
  }

  @PostMapping("/announcements")
  public Map<String, Object> saveAnnouncement(@RequestBody Map<String, Object> body) {
    return notify.saveAnnouncement(body);
  }

  @DeleteMapping("/announcements/{id}")
  public ResponseEntity<Void> deleteAnnouncement(@PathVariable("id") String id) {
    notify.deleteAnnouncement(id);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/quick-replies")
  public List<Map<String, Object>> quickReplies() {
    return notify.quickReplies();
  }

  @PostMapping("/quick-replies")
  public Map<String, Object> saveQuickReply(@RequestBody Map<String, Object> body) {
    return notify.saveQuickReply(body);
  }

  @DeleteMapping("/quick-replies/{id}")
  public ResponseEntity<Void> deleteQuickReply(@PathVariable("id") String id) {
    notify.deleteQuickReply(id);
    return ResponseEntity.noContent().build();
  }

  // ───── 报表 ─────

  @GetMapping("/report/{kind}")
  public Map<String, Object> reportEndpoint(
      @PathVariable("kind") String kind,
      @RequestParam(value = "window_min", defaultValue = "60") int windowMin,
      @RequestParam(value = "bucket_sec", required = false) Integer bucketSec) {
    return report.report(kind, windowMin, bucketSec);
  }

  // ───── 审计 ─────

  @GetMapping("/audit/events")
  public Map<String, Object> auditEvents(
      @RequestParam(value = "kind", required = false) String kind,
      @RequestParam(value = "actor_id", required = false) Long actorId,
      @RequestParam(value = "session_id", required = false) String sessionId,
      @RequestParam(value = "since", required = false) String since,
      @RequestParam(value = "limit", defaultValue = "100") int limit) {
    StringBuilder qs = new StringBuilder();
    if (kind != null && !kind.isBlank()) qs.append("kind=").append(kind).append("&");
    if (actorId != null) qs.append("actor_id=").append(actorId).append("&");
    if (sessionId != null && !sessionId.isBlank())
      qs.append("session_id=").append(sessionId).append("&");
    if (since != null && !since.isBlank()) qs.append("since=").append(since).append("&");
    qs.append("limit=").append(limit);
    return audit.query(qs.toString());
  }
}
