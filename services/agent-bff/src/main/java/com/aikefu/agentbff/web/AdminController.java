package com.aikefu.agentbff.web;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.agentbff.clients.KbClient;

/**
 * 管理后台 — 透传 kb-svc 等下游服务的只读 / 调试端点,避免前端直连。
 *
 * <p>M3 末加 JWT + 角色 (ADMIN / SUPERVISOR) 鉴权;当前仅在内网部署,沿用网关层 IP 白名单。
 */
@RestController
@RequestMapping("/v1/admin")
public class AdminController {

  private final KbClient kb;

  public AdminController(KbClient kb) {
    this.kb = kb;
  }

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
}
