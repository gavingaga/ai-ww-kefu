package com.aikefu.livectx.web;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.livectx.service.LiveContextService;
import com.aikefu.livectx.store.LiveContextStore;

@RestController
@RequestMapping("/v1/live")
public class LiveContextController {

  private final LiveContextService svc;
  private final LiveContextStore store;

  public LiveContextController(LiveContextService svc, LiveContextStore store) {
    this.svc = svc;
    this.store = store;
  }

  @GetMapping("/healthz")
  public Map<String, Object> healthz() {
    return Map.of(
        "status", "ok",
        "size", store.size(),
        "capacity", store.capacity(),
        "ttl_seconds", store.ttl().toSeconds());
  }

  /**
   * 拉取拼合后的 LiveContext — ai-hub / agent-bff 用。
   *
   * <p>必传 scene;按 scene 至少传 room_id 或 vod_id;uid 可选。
   */
  @GetMapping("/context")
  public ResponseEntity<Map<String, Object>> context(
      @RequestParam("scene") String scene,
      @RequestParam(value = "room_id", required = false) Long roomId,
      @RequestParam(value = "vod_id", required = false) Long vodId,
      @RequestParam(value = "uid", required = false) Long uid) {
    if (scene == null || scene.isBlank()) {
      return ResponseEntity.badRequest().body(Map.of("error", "scene required"));
    }
    return ResponseEntity.ok(svc.resolve(scene, roomId, vodId, uid));
  }

  /**
   * SDK 上报客户端 LiveContext 快照(JSBridge 周期上报或客服打开瞬间)。
   *
   * <p>请求体即 LiveContext JSON;按 scene 写入对应键。返回服务端拼合结果以便前端校验。
   */
  @PostMapping("/context")
  public ResponseEntity<Map<String, Object>> report(@RequestBody Map<String, Object> body) {
    java.util.List<String> errors = LiveContextValidator.validate(body);
    if (!errors.isEmpty()) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "errors", errors));
    }
    String scene = String.valueOf(body.getOrDefault("scene", ""));
    Long roomId = asLong(body.get("room_id"));
    Long vodId = asLong(body.get("vod_id"));
    Long uid = asLong(asMap(body.get("user")).get("uid"));

    if (roomId != null) svc.reportRoom(roomId, body);
    if (vodId != null) svc.reportVod(vodId, body);
    if (uid != null) svc.reportUser(uid, body);

    Map<String, Object> resolved = svc.resolve(scene, roomId, vodId, uid);
    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("ok", true);
    resp.put("context", resolved);
    return ResponseEntity.ok(resp);
  }

  private static Long asLong(Object v) {
    if (v == null) return null;
    if (v instanceof Number n) return n.longValue();
    try {
      return Long.parseLong(String.valueOf(v));
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asMap(Object v) {
    if (v instanceof Map<?, ?> m) return (Map<String, Object>) m;
    return Map.of();
  }
}
