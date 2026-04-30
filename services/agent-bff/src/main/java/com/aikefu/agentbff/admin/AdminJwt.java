package com.aikefu.agentbff.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 管理后台 HS256 JWT — 与 visitor JwtCodec 隔离密钥,避免 visitor token 误当 admin 用。
 *
 * <p>密钥 {@code aikefu.admin.jwt.secret};留空则进程级随机(只 dev),生产必配。
 */
@Component
public class AdminJwt {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final Base64.Encoder URL_ENC = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder URL_DEC = Base64.getUrlDecoder();

  private final byte[] key;

  public AdminJwt(@Value("${aikefu.admin.jwt.secret:}") String secret) {
    if (secret == null || secret.isBlank()) {
      String fallback = "aikefu-admin-dev-" + System.nanoTime();
      this.key = sha256(fallback.getBytes(StandardCharsets.UTF_8));
    } else {
      this.key = secret.length() < 32 ? sha256(secret.getBytes(StandardCharsets.UTF_8))
                                      : secret.getBytes(StandardCharsets.UTF_8);
    }
  }

  public String encode(Map<String, Object> claims, long ttlSeconds) {
    long now = System.currentTimeMillis() / 1000L;
    Map<String, Object> body = new LinkedHashMap<>(claims);
    body.put("iat", now);
    body.put("exp", now + Math.max(60L, ttlSeconds));
    String header = URL_ENC.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
    String payload;
    try {
      payload = URL_ENC.encodeToString(MAPPER.writeValueAsBytes(body));
    } catch (Exception e) {
      throw new IllegalStateException("encode payload failed", e);
    }
    String signing = header + "." + payload;
    String sig = URL_ENC.encodeToString(hmac(signing.getBytes(StandardCharsets.UTF_8)));
    return signing + "." + sig;
  }

  public Map<String, Object> decode(String token) {
    if (token == null || token.isBlank()) throw new InvalidTokenException("empty");
    String[] parts = token.split("\\.");
    if (parts.length != 3) throw new InvalidTokenException("malformed");
    String signing = parts[0] + "." + parts[1];
    byte[] expect = hmac(signing.getBytes(StandardCharsets.UTF_8));
    byte[] got;
    try {
      got = URL_DEC.decode(parts[2]);
    } catch (IllegalArgumentException e) {
      throw new InvalidTokenException("bad signature encoding");
    }
    if (!MessageDigest.isEqual(expect, got)) throw new InvalidTokenException("signature mismatch");
    Map<String, Object> claims;
    try {
      claims = MAPPER.readValue(URL_DEC.decode(parts[1]), Map.class);
    } catch (Exception e) {
      throw new InvalidTokenException("bad payload");
    }
    Object exp = claims.get("exp");
    long now = System.currentTimeMillis() / 1000L;
    if (exp instanceof Number n && n.longValue() < now) throw new InvalidTokenException("expired");
    return claims;
  }

  private byte[] hmac(byte[] data) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      return mac.doFinal(data);
    } catch (Exception e) {
      throw new IllegalStateException("HmacSHA256 failed", e);
    }
  }

  private static byte[] sha256(byte[] in) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(in);
    } catch (Exception e) {
      throw new IllegalStateException("SHA-256 unavailable", e);
    }
  }

  public static class InvalidTokenException extends RuntimeException {
    public InvalidTokenException(String msg) {
      super(msg);
    }
  }
}
