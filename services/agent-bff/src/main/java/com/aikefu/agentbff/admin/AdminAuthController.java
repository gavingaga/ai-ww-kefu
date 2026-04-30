package com.aikefu.agentbff.admin;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理后台登录 / 当前用户。
 *
 * <pre>
 *   POST /v1/admin/auth/login   {identifier, password} → {token, user, expires_in}
 *   GET  /v1/admin/auth/me      Authorization: Bearer <token> → user
 *   POST /v1/admin/auth/logout  Authorization: Bearer <token> → 204(token 自然过期,这里幂等)
 * </pre>
 */
@RestController
@RequestMapping("/v1/admin/auth")
public class AdminAuthController {

  private final UserService users;
  private final AdminJwt jwt;
  private final long ttlSec;

  public AdminAuthController(
      UserService users,
      AdminJwt jwt,
      @Value("${aikefu.admin.jwt.ttl-seconds:43200}") long ttlSec) {
    this.users = users;
    this.jwt = jwt;
    this.ttlSec = ttlSec;
  }

  @PostMapping("/login")
  public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, Object> body) {
    String identifier = body == null ? null : (String) body.get("identifier");
    String password = body == null ? null : (String) body.get("password");
    Optional<User> u = users.authenticate(identifier, password);
    if (u.isEmpty()) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("error", "invalid credentials"));
    }
    User user = u.get();
    Map<String, Object> claims = new LinkedHashMap<>();
    claims.put("sub", user.getId());
    claims.put("uname", user.getUsername());
    claims.put("roles", user.getRoles());
    String token = jwt.encode(claims, ttlSec);
    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("token", token);
    resp.put("user", users.view(user));
    resp.put("expires_in", ttlSec);
    return ResponseEntity.ok(resp);
  }

  @GetMapping("/me")
  public ResponseEntity<Map<String, Object>> me(
      @RequestHeader(value = "Authorization", required = false) String authHeader) {
    if (authHeader == null || !authHeader.startsWith("Bearer ")) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "no token"));
    }
    String token = authHeader.substring(7);
    Map<String, Object> claims;
    try {
      claims = jwt.decode(token);
    } catch (AdminJwt.InvalidTokenException e) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", e.getMessage()));
    }
    Object sub = claims.get("sub");
    if (!(sub instanceof Number n)) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "no sub"));
    }
    User u;
    try {
      u = users.get(n.longValue());
    } catch (UserService.UserNotFound e) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "user gone"));
    }
    if (u.isDisabled()) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "disabled"));
    }
    return ResponseEntity.ok(users.view(u));
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout() {
    // stateless JWT,无服务端会话可清;前端清 token 即可,这里返 204 让客户端有明确 200
    return ResponseEntity.noContent().build();
  }
}
