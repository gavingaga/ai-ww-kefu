package com.aikefu.livectx.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class LiveContextValidatorTest {

  @Test
  void validLiveRoomPasses() {
    Map<String, Object> body =
        Map.of(
            "scene", "live_room",
            "room_id", 8001,
            "play", Map.of("state", "playing", "quality", "720p", "bitrate_kbps", 4500),
            "network", Map.of("type", "wifi", "rtt_ms", 30),
            "user", Map.of("uid", 12345, "is_anchor", false));
    assertThat(invoke(body)).isEmpty();
  }

  @Test
  void rejectsUnknownScene() {
    var errors = invoke(Map.of("scene", "evil_scene"));
    assertThat(errors).anyMatch(e -> e.contains("scene not in enum"));
  }

  @Test
  void liveRoomRequiresRoomId() {
    var errors = invoke(Map.of("scene", "live_room"));
    assertThat(errors).anyMatch(e -> e.contains("requires room_id"));
  }

  @Test
  void rejectsNegativeIdsAndOutOfRangeFps() {
    var errors =
        invoke(
            Map.of(
                "scene", "live_room",
                "room_id", -5,
                "play", Map.of("fps", 999)));
    assertThat(errors).anyMatch(e -> e.contains("room_id must be ≥ 0"));
    assertThat(errors).anyMatch(e -> e.contains("play.fps out of [0,240]"));
  }

  @Test
  void rejectsBadEnumsAndMalformedHash() {
    var errors =
        invoke(
            Map.of(
                "scene", "live_room",
                "room_id", 1,
                "play",
                    Map.of(
                        "state", "frozen", "quality", "8k", "stream_url_hash", "https://leak.cdn"),
                "network", Map.of("type", "starlink"),
                "report", Map.of("type", "fake")));
    assertThat(errors).anyMatch(e -> e.contains("play.state not in enum"));
    assertThat(errors).anyMatch(e -> e.contains("play.quality not in enum"));
    assertThat(errors).anyMatch(e -> e.contains("stream_url_hash invalid"));
    assertThat(errors).anyMatch(e -> e.contains("network.type not in enum"));
    assertThat(errors).anyMatch(e -> e.contains("report.type not in enum"));
  }

  @Test
  void userTypeMismatchesRejected() {
    var errors =
        invoke(
            Map.of(
                "scene", "live_room",
                "room_id", 1,
                "user", Map.of("uid", -1, "is_anchor", "yes", "is_minor_guard", 1)));
    assertThat(errors).anyMatch(e -> e.contains("user.uid must be positive"));
    assertThat(errors).anyMatch(e -> e.contains("user.is_anchor must be boolean"));
    assertThat(errors).anyMatch(e -> e.contains("user.is_minor_guard must be boolean"));
  }

  private static List<String> invoke(Map<String, Object> body) {
    // 用包私有方法 — 与 Controller 同包
    return new TestProxy().validate(body);
  }

  /** 透过同包反射访问 package-private validate。 */
  static class TestProxy {
    List<String> validate(Map<String, Object> body) {
      try {
        var m = LiveContextValidator.class.getDeclaredMethod("validate", Map.class);
        m.setAccessible(true);
        @SuppressWarnings("unchecked")
        var list = (List<String>) m.invoke(null, body);
        return list;
      } catch (ReflectiveOperationException e) {
        throw new AssertionError(e);
      }
    }
  }
}
