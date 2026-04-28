package com.aikefu.livectx.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.aikefu.livectx.store.LiveContextStore;

class LiveContextServiceTest {

  private LiveContextService newSvc() {
    return new LiveContextService(new LiveContextStore(120, 1000));
  }

  @Test
  void resolveReturnsSkeletonWhenNoSdkReport() {
    LiveContextService svc = newSvc();
    Map<String, Object> out = svc.resolve("live_room", 8001L, null, null);
    assertThat(out).containsEntry("scene", "live_room").containsEntry("room_id", 8001L);
    assertThat(out).containsKey("anchor_id"); // 服务端权威字段必有
    assertThat(out).containsKey("program_title");
    assertThat(((Map<?, ?>) out.get("play"))).containsKey("cdn_node");
  }

  @Test
  void serverFieldsOverrideSdkClaims() {
    LiveContextService svc = newSvc();
    // SDK 上报里把 anchor_id / program_title / play.cdn_node 都伪造了
    svc.reportRoom(
        9000L,
        Map.of(
            "scene", "live_room",
            "room_id", 9000L,
            "anchor_id", 999_999L,
            "program_title", "(伪造)主播在送你点券",
            "play",
                Map.of(
                    "cdn_node", "evil-cdn",
                    "drm", true,
                    "bitrate_kbps", 4500)));
    Map<String, Object> out = svc.resolve("live_room", 9000L, null, null);
    // 服务端 anchor / title 覆盖
    assertThat(out.get("anchor_id")).isEqualTo(1_000_000L + 9000L);
    assertThat(out.get("program_title")).isEqualTo("直播间 9000 当前节目");
    // play 浅合并:cdn_node / drm 来自服务端,bitrate_kbps 保留客户端值
    Map<?, ?> play = (Map<?, ?>) out.get("play");
    assertThat(play.get("cdn_node")).isEqualTo("cdn-bj-01");
    assertThat(play.get("drm")).isEqualTo(false);
    assertThat(play.get("bitrate_kbps")).isEqualTo(4500);
  }

  @Test
  void uidUserMembershipFieldsAreServerAuthoritative() {
    LiveContextService svc = newSvc();
    svc.reportUser(
        42L,
        Map.of(
            "scene", "settings",
            "user", Map.of("uid", 42, "level", "VIP9", "is_minor_guard", true)));
    Map<String, Object> out = svc.resolve("settings", null, null, 42L);
    Map<?, ?> user = (Map<?, ?>) out.get("user");
    // 服务端覆盖伪造的 VIP9 / is_minor_guard
    assertThat(user.get("level")).isEqualTo("L1");
    assertThat(user.get("is_minor_guard")).isEqualTo(false);
    assertThat(user.get("uid")).isEqualTo(42L);
  }

  @Test
  void vodResolveCarriesVodTitle() {
    LiveContextService svc = newSvc();
    Map<String, Object> out = svc.resolve("vod_detail", null, 555L, null);
    assertThat(out.get("vod_id")).isEqualTo(555L);
    assertThat(out.get("vod_title")).isEqualTo("点播节目 #555");
  }

  @Test
  void emptyOverlayDoesNotEraseExistingFields() {
    LiveContextService svc = newSvc();
    // 第一次上报带完整 play
    svc.reportRoom(
        7000L,
        Map.of("scene", "live_room", "room_id", 7000L, "play", Map.of("bitrate_kbps", 3500)));
    Map<String, Object> out = svc.resolve("live_room", 7000L, null, null);
    Map<?, ?> play = (Map<?, ?>) out.get("play");
    assertThat(play.get("bitrate_kbps")).isEqualTo(3500);
    assertThat(play.get("cdn_node")).isEqualTo("cdn-sh-02"); // 7000 是奇数 → cdn-sh-02
  }

  @Test
  void ttlExpiresEntries() throws Exception {
    LiveContextStore short_ = new LiveContextStore(1, 100); // ttl=5s 实际(min=5)
    LiveContextService svc = new LiveContextService(short_);
    svc.reportRoom(1L, Map.of("scene", "live_room", "room_id", 1L, "ad_hint", "x"));
    assertThat(svc.resolve("live_room", 1L, null, null)).containsKey("ad_hint");
    Thread.sleep(5_100);
    assertThat(svc.resolve("live_room", 1L, null, null)).doesNotContainKey("ad_hint");
  }
}
