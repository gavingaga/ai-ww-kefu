package com.aikefu.agentbff.clients;

import java.time.Duration;
import java.util.Map;

import jakarta.annotation.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** gateway-ws 内部 push 客户端 — 把消息实时推到 C 端的 WS 连接。 */
@Component
public class GatewayClient {

  private static final Logger log = LoggerFactory.getLogger(GatewayClient.class);

  private final RestClient client;
  private final @Nullable String token;
  private final boolean enabled;

  public GatewayClient(
      @Value("${aikefu.gateway-ws.url:}") String baseUrl,
      @Value("${aikefu.gateway-ws.internal-token:}") String token,
      @Value("${aikefu.gateway-ws.timeout-ms:1500}") int timeoutMs) {
    this.token = token == null || token.isBlank() ? null : token;
    this.enabled = baseUrl != null && !baseUrl.isBlank();
    if (this.enabled) {
      var f = new SimpleClientHttpRequestFactory();
      f.setConnectTimeout(Duration.ofMillis(timeoutMs));
      f.setReadTimeout(Duration.ofMillis(timeoutMs));
      this.client = RestClient.builder().baseUrl(baseUrl).requestFactory(f).build();
    } else {
      this.client = null;
    }
  }

  /**
   * 把一帧推到指定会话的全部 WS 连接。失败仅日志,不抛(异步路径不应阻塞坐席回写)。
   *
   * @param sessionId 目标会话
   * @param frame 完整 frame 体(含 type / payload / msg_id 等)
   */
  public void push(String sessionId, Map<String, Object> frame) {
    if (!enabled || client == null) return;
    try {
      var spec =
          client
              .post()
              .uri("/internal/push")
              .body(Map.of("session_id", sessionId, "frame", frame));
      if (token != null) {
        spec = spec.headers((HttpHeaders h) -> h.set("X-Internal-Token", token));
      }
      spec.retrieve().toBodilessEntity();
    } catch (Exception e) {
      log.warn("gateway-ws push failed sid={} err={}", sessionId, e.getMessage());
    }
  }

  public boolean isEnabled() {
    return enabled;
  }
}
