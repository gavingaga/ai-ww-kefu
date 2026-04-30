package com.aikefu.session.visitor;

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
 * 极简 HS256 JWT 编解码 — 仅用于 visitor token,不引入 jjwt 依赖。
 *
 * <p>密钥 {@code aikefu.visitor.jwt.secret}:
 * <ul>
 *   <li>未配 / 留空时自动生成进程级随机密钥(每次重启失效),仅适合 dev。
 *   <li>生产用 env {@code VISITOR_JWT_SECRET} 注入 ≥32 字节强密钥。
 * </ul>
 */
@Component
public class JwtCodec {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final Base64.Encoder URL_ENC = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder URL_DEC = Base64.getUrlDecoder();

  private final byte[] key;

  public JwtCodec(@Value("${aikefu.visitor.jwt.secret:}") String secret) {
    if (secret == null || secret.isBlank()) {
      // dev 兜底:用进程启动时间派生伪随机,避免空密钥;生产必须显式配。
      String fallback = "aikefu-dev-secret-" + System.nanoTime();
      this.key = sha256(fallback.getBytes(StandardCharsets.UTF_8));
    } else {
      this.key = secret.length() < 32 ? sha256(secret.getBytes(StandardCharsets.UTF_8))
                                      : secret.getBytes(StandardCharsets.UTF_8);
    }
  }

  /** 签发:claims 按插入序写入 payload,自动加 iat / exp。 */
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

  /**
   * 校验 + 解析。token 非法 / 过期 / 签名错均抛 {@link InvalidTokenException}。
   *
   * @return claims map(已含 iat / exp)
   */
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
