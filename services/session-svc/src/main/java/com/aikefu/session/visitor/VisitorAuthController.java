package com.aikefu.session.visitor;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.session.domain.Session;
import com.aikefu.session.domain.SessionStatus;
import com.aikefu.session.service.SessionService;

/**
 * 访客鉴权 — 统一入口替换 web-c 直接调 /v1/sessions/current 的 demo 链路。
 *
 * <pre>
 *   POST /v1/visitors/auth
 *   body: { device_id, tenant_id?, channel?, token? }
 *   resp: { token, visitor_id, session_id, ws_endpoint, expires_in }
 * </pre>
 *
 * <p>逻辑:
 * <ol>
 *   <li>带 token 且未过期:验签 → 复用 claims.sid(若 session 已 CLOSED 则按 device_id 重建)。
 *   <li>无 token / 失效:device_id 派生稳定 visitor_id(hash) →
 *       {@link SessionService#getOrCreateCurrent} 拿 sid → 签新 token。
 * </ol>
 *
 * <p>token 默认 7 天 TTL,可配 {@code aikefu.visitor.jwt.ttl-seconds}。
 */
@RestController
public class VisitorAuthController {

  private final JwtCodec jwt;
  private final SessionService sessions;
  private final long ttlSec;
  private final String wsEndpoint;

  public VisitorAuthController(
      JwtCodec jwt,
      SessionService sessions,
      @Value("${aikefu.visitor.jwt.ttl-seconds:604800}") long ttlSec,
      @Value("${aikefu.visitor.ws-endpoint:ws://localhost:8080/v1/ws}") String wsEndpoint) {
    this.jwt = jwt;
    this.sessions = sessions;
    this.ttlSec = ttlSec;
    this.wsEndpoint = wsEndpoint;
  }

  @PostMapping("/v1/visitors/auth")
  public ResponseEntity<Map<String, Object>> auth(@RequestBody Map<String, Object> body) {
    String deviceId = strOr(body, "device_id", "");
    if (deviceId.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "device_id required"));
    long tenantId = numOr(body, "tenant_id", 1L);
    String channel = strOr(body, "channel", "web");
    String token = strOr(body, "token", null);

    long visitorId = visitorIdOf(tenantId, deviceId);
    String sessionId = null;

    // 路径 1:带 token 且有效 → 复用 sid
    if (token != null && !token.isBlank()) {
      try {
        Map<String, Object> claims = jwt.decode(token);
        Object claimSid = claims.get("sid");
        if (claimSid instanceof String s && !s.isBlank()) {
          try {
            Session existing = sessions.getById(s);
            if (existing != null && existing.getStatus() != SessionStatus.CLOSED) {
              sessionId = s;
              // visitor_id 也以 token 为准(防 device_id 被改)
              Object claimSub = claims.get("sub");
              if (claimSub instanceof Number n) visitorId = n.longValue();
            }
          } catch (RuntimeException ignored) {
            // session 已不存在,落到路径 2 重建
          }
        }
      } catch (JwtCodec.InvalidTokenException ignored) {
        // 失效 / 篡改 → 走路径 2
      }
    }

    // 路径 2:按 device_id 派生 visitor_id 取 / 建会话
    if (sessionId == null) {
      Session s = sessions.getOrCreateCurrent(tenantId, visitorId, channel, null);
      sessionId = s.getId();
    }

    Map<String, Object> claims = new LinkedHashMap<>();
    claims.put("sub", visitorId);
    claims.put("tenant", tenantId);
    claims.put("sid", sessionId);
    claims.put("device", deviceId);
    String issued = jwt.encode(claims, ttlSec);

    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("token", issued);
    resp.put("visitor_id", visitorId);
    resp.put("session_id", sessionId);
    resp.put("ws_endpoint", wsEndpoint);
    resp.put("expires_in", ttlSec);
    return ResponseEntity.status(HttpStatus.OK).body(resp);
  }

  /** device_id 派生稳定的 visitor 数字 id:64-bit hash 取正,避免 long 溢出。 */
  private static long visitorIdOf(long tenantId, String deviceId) {
    long h = 1469598103934665603L; // FNV-1a 64 offset
    for (byte b : (tenantId + ":" + deviceId).getBytes()) {
      h ^= (b & 0xff);
      h *= 1099511628211L;
    }
    long v = h & 0x7fffffffffffffffL;
    return v == 0 ? 1L : v;
  }

  private static String strOr(Map<String, Object> m, String k, String fb) {
    Object v = m == null ? null : m.get(k);
    return v == null ? fb : String.valueOf(v);
  }

  private static long numOr(Map<String, Object> m, String k, long fb) {
    Object v = m == null ? null : m.get(k);
    if (v instanceof Number n) return n.longValue();
    if (v instanceof String s) {
      try {
        return Long.parseLong(s);
      } catch (NumberFormatException ignored) {
        // fall through
      }
    }
    return fb;
  }
}
