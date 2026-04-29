package com.aikefu.livectx.web;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * LiveContext 字段校验 — 抗 H5 / JSBridge 伪造与脏数据。
 *
 * <p>规则与 packages/proto/live-context/live-context.schema.json 对齐。
 * 返回错误数组,空数组表示合法。
 */
final class LiveContextValidator {

  private static final Set<String> SCENES =
      Set.of("live_room", "vod_detail", "home", "settings", "anchor_console", "report_flow");
  private static final Set<String> PLAY_STATES =
      Set.of("playing", "buffering", "paused", "error", "idle");
  private static final Set<String> QUALITIES =
      Set.of("auto", "240p", "360p", "480p", "720p", "1080p", "1440p", "4k");
  private static final Set<String> NETWORK_TYPES =
      Set.of("wifi", "4g", "5g", "ethernet", "unknown");
  private static final Set<String> ENTRIES =
      Set.of("bubble", "drawer", "fullscreen", "menu", "report_button", "agent_console");
  private static final Set<String> REPORT_TYPES =
      Set.of("porn", "abuse", "copyright", "minor", "other");

  private LiveContextValidator() {}

  static List<String> validate(Map<String, Object> body) {
    List<String> errors = new ArrayList<>();
    if (body == null || body.isEmpty()) {
      errors.add("body required");
      return errors;
    }
    String scene = stringOrNull(body.get("scene"));
    if (scene == null || scene.isBlank()) {
      errors.add("scene required");
    } else if (!SCENES.contains(scene)) {
      errors.add("scene not in enum: " + scene + " (allowed=" + SCENES + ")");
    }
    Long roomId = nonNegLong(body.get("room_id"), errors, "room_id");
    Long vodId = nonNegLong(body.get("vod_id"), errors, "vod_id");
    nonNegLong(body.get("anchor_id"), errors, "anchor_id");
    if ("live_room".equals(scene) && roomId == null) {
      errors.add("scene=live_room requires room_id");
    }
    if ("vod_detail".equals(scene) && vodId == null) {
      errors.add("scene=vod_detail requires vod_id");
    }
    Object entry = body.get("entry");
    if (entry != null && !ENTRIES.contains(String.valueOf(entry))) {
      errors.add("entry not in enum: " + entry);
    }
    validatePlay(body.get("play"), errors);
    validateNetwork(body.get("network"), errors);
    validateUser(body.get("user"), errors);
    validateReport(body.get("report"), errors);
    return errors;
  }

  private static void validatePlay(Object v, List<String> errors) {
    if (v == null) return;
    if (!(v instanceof Map<?, ?> m)) {
      errors.add("play must be object");
      return;
    }
    Object state = m.get("state");
    if (state != null && !PLAY_STATES.contains(String.valueOf(state))) {
      errors.add("play.state not in enum: " + state);
    }
    Object q = m.get("quality");
    if (q != null && !QUALITIES.contains(String.valueOf(q))) {
      errors.add("play.quality not in enum: " + q);
    }
    nonNegInt(m.get("bitrate_kbps"), errors, "play.bitrate_kbps");
    nonNegInt(m.get("first_frame_ms"), errors, "play.first_frame_ms");
    nonNegInt(m.get("buffer_events_60s"), errors, "play.buffer_events_60s");
    Object fps = m.get("fps");
    if (fps != null) {
      Long n = asLong(fps);
      if (n == null || n < 0 || n > 240) errors.add("play.fps out of [0,240]: " + fps);
    }
    Object hash = m.get("stream_url_hash");
    if (hash != null && !String.valueOf(hash).matches("^[a-f0-9]{8,64}$")) {
      errors.add("play.stream_url_hash invalid; 上传明文 URL 是禁忌");
    }
  }

  private static void validateNetwork(Object v, List<String> errors) {
    if (v == null) return;
    if (!(v instanceof Map<?, ?> m)) {
      errors.add("network must be object");
      return;
    }
    Object t = m.get("type");
    if (t != null && !NETWORK_TYPES.contains(String.valueOf(t))) {
      errors.add("network.type not in enum: " + t);
    }
    nonNegInt(m.get("rtt_ms"), errors, "network.rtt_ms");
  }

  private static void validateUser(Object v, List<String> errors) {
    if (v == null) return;
    if (!(v instanceof Map<?, ?> m)) {
      errors.add("user must be object");
      return;
    }
    Object uid = m.get("uid");
    if (uid != null) {
      Long n = asLong(uid);
      if (n == null || n <= 0) errors.add("user.uid must be positive integer");
    }
    Object isAnchor = m.get("is_anchor");
    if (isAnchor != null && !(isAnchor instanceof Boolean)) {
      errors.add("user.is_anchor must be boolean");
    }
    Object minor = m.get("is_minor_guard");
    if (minor != null && !(minor instanceof Boolean)) {
      errors.add("user.is_minor_guard must be boolean");
    }
  }

  private static void validateReport(Object v, List<String> errors) {
    if (v == null) return;
    if (!(v instanceof Map<?, ?> m)) {
      errors.add("report must be object");
      return;
    }
    Object t = m.get("type");
    if (t != null && !REPORT_TYPES.contains(String.valueOf(t))) {
      errors.add("report.type not in enum: " + t);
    }
    nonNegInt(m.get("ts_in_stream"), errors, "report.ts_in_stream");
  }

  // ───── helpers ─────

  private static String stringOrNull(Object v) {
    return v == null ? null : String.valueOf(v);
  }

  private static Long asLong(Object v) {
    if (v == null) return null;
    if (v instanceof Number n) return n.longValue();
    try {
      return Long.parseLong(String.valueOf(v));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static Long nonNegLong(Object v, List<String> errors, String name) {
    if (v == null) return null;
    Long n = asLong(v);
    if (n == null) {
      errors.add(name + " must be integer: " + v);
      return null;
    }
    if (n < 0) {
      errors.add(name + " must be ≥ 0: " + v);
      return null;
    }
    return n;
  }

  private static void nonNegInt(Object v, List<String> errors, String name) {
    if (v == null) return;
    Long n = asLong(v);
    if (n == null || n < 0) errors.add(name + " must be ≥ 0 integer: " + v);
  }
}
