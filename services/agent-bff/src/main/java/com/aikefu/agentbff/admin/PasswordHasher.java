package com.aikefu.agentbff.admin;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Base64;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

import org.springframework.stereotype.Component;

/**
 * PBKDF2-SHA256 密码哈希 — 不引入 spring-security / bcrypt 依赖。
 *
 * <p>存储格式: {@code pbkdf2$<iterations>$<saltB64>$<hashB64>}。verify 比对 iterations + salt
 * 拿出来重算,常量时间比对避免 timing leak。
 */
@Component
public class PasswordHasher {

  private static final int ITERATIONS = 120_000;
  private static final int KEY_LEN_BITS = 256;
  private static final SecureRandom RNG = new SecureRandom();

  public String hash(String password) {
    if (password == null) password = "";
    byte[] salt = new byte[16];
    RNG.nextBytes(salt);
    byte[] hash = pbkdf2(password.toCharArray(), salt, ITERATIONS);
    return "pbkdf2$" + ITERATIONS
        + "$" + Base64.getEncoder().encodeToString(salt)
        + "$" + Base64.getEncoder().encodeToString(hash);
  }

  public boolean verify(String password, String stored) {
    if (stored == null || stored.isBlank()) return false;
    String[] parts = stored.split("\\$");
    if (parts.length != 4 || !"pbkdf2".equals(parts[0])) return false;
    int iter;
    try {
      iter = Integer.parseInt(parts[1]);
    } catch (NumberFormatException e) {
      return false;
    }
    byte[] salt = Base64.getDecoder().decode(parts[2]);
    byte[] expect = Base64.getDecoder().decode(parts[3]);
    byte[] got = pbkdf2((password == null ? "" : password).toCharArray(), salt, iter);
    return constantTimeEquals(expect, got);
  }

  private static byte[] pbkdf2(char[] password, byte[] salt, int iterations) {
    try {
      KeySpec spec = new PBEKeySpec(password, salt, iterations, KEY_LEN_BITS);
      SecretKeyFactory f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
      return f.generateSecret(spec).getEncoded();
    } catch (Exception e) {
      throw new IllegalStateException("PBKDF2 unavailable", e);
    }
  }

  private static boolean constantTimeEquals(byte[] a, byte[] b) {
    if (a == null || b == null || a.length != b.length) return false;
    int diff = 0;
    for (int i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff == 0;
  }

  /** 仅用于 dev seed 时打印初始密码,生产应通过邀请链路下发,不要打印。 */
  public static String randomPassword(int len) {
    final String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    StringBuilder sb = new StringBuilder(len);
    for (int i = 0; i < len; i++) sb.append(alphabet.charAt(RNG.nextInt(alphabet.length())));
    return new String(sb.toString().getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
  }
}
