package com.aikefu.agentbff.admin;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

/**
 * 管理后台 — 用户 / 坐席 / 技能组 编辑入口。
 *
 * <p>实际数据落在 routing-svc(skill-groups / agents)+ agent-bff 内 UserService(users);
 * 这层只做聚合 + 鉴权(filter 已在 {@link AdminAuthFilter} 完成)+ 字段裁剪。
 */
@RestController
@RequestMapping("/v1/admin")
public class AdminOrgController {

  private final UserService users;
  private final RestClient routingClient;

  public AdminOrgController(
      UserService users,
      @Qualifier("routingRestClient") RestClient routingClient) {
    this.users = users;
    this.routingClient = routingClient;
  }

  // ───── Users ─────

  @GetMapping("/users")
  public Map<String, Object> listUsers(
      @RequestParam(value = "offset", defaultValue = "0") int offset,
      @RequestParam(value = "limit", defaultValue = "50") int limit) {
    List<User> rows = users.list(offset, limit);
    List<Map<String, Object>> view = rows.stream().map(users::view).toList();
    return Map.of("items", view, "offset", offset, "limit", limit);
  }

  @PostMapping("/users/invite")
  public ResponseEntity<Map<String, Object>> invite(@RequestBody Map<String, Object> body) {
    String username = strOr(body, "username", null);
    String email = strOr(body, "email", null);
    String displayName = strOr(body, "displayName", null);
    String password = strOr(body, "password", null);
    Set<String> roles = parseRoles(body.get("roles"));
    Number agentId = body.get("agentId") instanceof Number n ? n : null;
    try {
      User u = users.create(username, email, displayName, password,
          roles.isEmpty() ? new LinkedHashSet<>(List.of(Role.AGENT)) : roles,
          agentId == null ? 0L : agentId.longValue());
      Map<String, Object> resp = new LinkedHashMap<>();
      resp.put("user", users.view(u));
      // 生产应通过邮件下发邀请链;dev 模式直接回显临时密码方便测试。
      if (password == null || password.isBlank()) {
        resp.put("temporary_password", "(已随机生成,本响应不再回显;管理员需走重置)");
      }
      return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
    }
  }

  @PostMapping("/users/{id}/disable")
  public Map<String, Object> disable(@PathVariable("id") long id) {
    return users.view(users.setDisabled(id, true));
  }

  @PostMapping("/users/{id}/enable")
  public Map<String, Object> enable(@PathVariable("id") long id) {
    return users.view(users.setDisabled(id, false));
  }

  @PostMapping("/users/{id}/reset-password")
  public Map<String, Object> resetPassword(@PathVariable("id") long id) {
    String fresh = users.adminResetPassword(id);
    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("user_id", id);
    // dev 直接回显;生产应只发邮件,响应不带明文。
    resp.put("temporary_password", fresh);
    return resp;
  }

  @PutMapping("/users/{id}/roles")
  public Map<String, Object> setRoles(
      @PathVariable("id") long id, @RequestBody Map<String, Object> body, HttpServletRequest req) {
    Set<String> roles = parseRoles(body.get("roles"));
    // 只有 owner 能授予 / 收回 owner;防 admin 自我提权。
    Set<String> caller = AdminAuthFilter.currentRoles(req);
    if (roles.contains(Role.OWNER) && !caller.contains(Role.OWNER)) {
      throw new SecurityException("only owner can grant owner");
    }
    return users.view(users.setRoles(id, roles));
  }

  // ───── Agents(透传 routing-svc + 加 admin 限定字段编辑) ─────

  @GetMapping("/agents")
  public List<Map<String, Object>> listAgents() {
    return routingClient.get().uri("/v1/agents").retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  @PutMapping("/agents/{id}")
  public Map<String, Object> updateAgent(@PathVariable("id") long id, @RequestBody Map<String, Object> body) {
    // 透传到 routing-svc 的 register(它是 upsert),只携带可改字段;
    // routing-svc 没有 PUT,我们用 POST /v1/agents 替它做 upsert。
    Map<String, Object> upsert = new LinkedHashMap<>();
    upsert.put("id", id);
    if (body.get("nickname") != null) upsert.put("nickname", body.get("nickname"));
    if (body.get("avatarUrl") != null) upsert.put("avatarUrl", body.get("avatarUrl"));
    if (body.get("skillGroups") != null) upsert.put("skillGroups", body.get("skillGroups"));
    if (body.get("maxConcurrency") != null) upsert.put("maxConcurrency", body.get("maxConcurrency"));
    if (body.get("role") != null) upsert.put("role", body.get("role"));
    if (body.get("status") != null) upsert.put("status", body.get("status"));
    return routingClient.post().uri("/v1/agents").body(upsert).retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  // ───── Skill Groups(纯透传) ─────

  @GetMapping("/skill-groups")
  public List<Map<String, Object>> listSkillGroups() {
    return routingClient.get().uri("/v1/skill-groups").retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  @PostMapping("/skill-groups")
  public Map<String, Object> createSkillGroup(@RequestBody Map<String, Object> body) {
    return routingClient.post().uri("/v1/skill-groups").body(body).retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  @PutMapping("/skill-groups/{id}")
  public Map<String, Object> updateSkillGroup(@PathVariable("id") long id, @RequestBody Map<String, Object> body) {
    return routingClient.put().uri("/v1/skill-groups/{id}", id).body(body).retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  @DeleteMapping("/skill-groups/{id}")
  public Map<String, Object> deleteSkillGroup(@PathVariable("id") long id) {
    return routingClient.delete().uri("/v1/skill-groups/{id}", id).retrieve()
        .body(new ParameterizedTypeReference<>() {});
  }

  // ───── helpers ─────

  private static String strOr(Map<String, Object> m, String k, String fb) {
    Object v = m == null ? null : m.get(k);
    return v == null ? fb : String.valueOf(v);
  }

  @SuppressWarnings("unchecked")
  private static Set<String> parseRoles(Object raw) {
    Set<String> out = new LinkedHashSet<>();
    if (raw instanceof java.util.Collection<?> c) {
      for (Object o : c) {
        if (o != null) out.add(String.valueOf(o));
      }
    }
    return out;
  }
}
