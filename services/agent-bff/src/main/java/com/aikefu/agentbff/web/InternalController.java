package com.aikefu.agentbff.web;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.agentbff.service.AgentService;

/**
 * 服务端→服务端 反向通知端点,供 gateway-ws / ai-hub / session-svc 调用。
 *
 * <p>受 {@code aikefu.internal-token} 保护(配置后请求需带 ``X-Internal-Token``)。
 */
@RestController
@RequestMapping("/v1/agent/_internal")
public class InternalController {

  private final AgentService svc;
  private final String token;

  public InternalController(
      AgentService svc, @Value("${aikefu.internal-token:}") String token) {
    this.svc = svc;
    this.token = token == null || token.isBlank() ? "" : token;
  }

  /**
   * gateway-ws 在 SessionRouter 入库 C 端消息后调用,把同一份消息以 session-message 事件
   * 推给当前承接的坐席与观察该会话的主管。body: {session_id, message}
   */
  @PostMapping("/session-message")
  public ResponseEntity<Map<String, Object>> sessionMessage(
      @RequestHeader(value = "X-Internal-Token", required = false) String reqToken,
      @RequestBody Map<String, Object> body) {
    if (!token.isEmpty() && !token.equals(reqToken)) {
      return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
    }
    String sid = (String) (body == null ? null : body.get("session_id"));
    @SuppressWarnings("unchecked")
    Map<String, Object> message =
        body == null ? null : (Map<String, Object>) body.get("message");
    if (sid == null || sid.isBlank() || message == null) {
      return ResponseEntity.badRequest().body(Map.of("error", "session_id + message required"));
    }
    svc.notifyExternalSessionMessage(sid, message);
    return ResponseEntity.ok(Map.of("ok", true));
  }
}
