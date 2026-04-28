package com.aikefu.livectx.service;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.aikefu.livectx.store.LiveContextStore;

/**
 * LiveContext 拼合 — 服务端权威字段叠加在 SDK 上报之上。
 *
 * <p>当前(M3 起步)服务端"权威"字段是 mock 出来的(by room_id / vod_id 派生);
 * 后续接 livestream-svc / vod-svc / membership-svc 替换 {@link #serverAuthoritative}。
 *
 * <p>合并规则:
 *
 * <ul>
 *   <li>SDK 上报(若有)作为 base
 *   <li>服务端权威字段覆盖关键字段(anchor_id / program_title / cdn_node / drm /
 *       user.* / vod_title 等),防 H5 伪造
 *   <li>对象字段做浅合并(eg. {@code play.bitrate_kbps} 来自客户端,{@code play.cdn_node}
 *       来自服务端)
 * </ul>
 */
@Service
public class LiveContextService {

  private final LiveContextStore store;

  public LiveContextService(LiveContextStore store) {
    this.store = store;
  }

  // ───── 上报 ─────

  public Map<String, Object> reportRoom(long roomId, Map<String, Object> sdk) {
    return store.upsert("room:" + roomId, sdk);
  }

  public Map<String, Object> reportVod(long vodId, Map<String, Object> sdk) {
    return store.upsert("vod:" + vodId, sdk);
  }

  public Map<String, Object> reportUser(long uid, Map<String, Object> sdk) {
    return store.upsert("u:" + uid, sdk);
  }

  // ───── 取拼合后的快照 ─────

  /**
   * 按 scene + (room_id | vod_id) 取最近一次上报,并叠加服务端权威字段。
   *
   * @param scene live_room / vod_detail / anchor_console / ...
   * @param roomId 直播间 id(可空)
   * @param vodId 点播 id(可空)
   * @param uid 用户 id(可空)
   * @return 合并后的 LiveContext;若无任何 SDK 上报与服务端字段,返回最小骨架 {scene}
   */
  public Map<String, Object> resolve(String scene, Long roomId, Long vodId, Long uid) {
    Map<String, Object> base = new LinkedHashMap<>();
    if (scene != null) base.put("scene", scene);
    if (roomId != null) base.put("room_id", roomId);
    if (vodId != null) base.put("vod_id", vodId);

    if (roomId != null) {
      Map<String, Object> sdk = store.get("room:" + roomId);
      if (sdk != null) shallowMerge(base, sdk);
    }
    if (vodId != null) {
      Map<String, Object> sdk = store.get("vod:" + vodId);
      if (sdk != null) shallowMerge(base, sdk);
    }
    if (uid != null) {
      Map<String, Object> sdk = store.get("u:" + uid);
      if (sdk != null) shallowMerge(base, sdk);
    }

    Map<String, Object> server = serverAuthoritative(scene, roomId, vodId, uid);
    if (!server.isEmpty()) {
      shallowMerge(base, server);
    }
    return base;
  }

  /**
   * 服务端权威字段 mock — M3 起步硬编码;后续接业务系统真接口。
   * 关键点:无论 SDK 上报什么,这些字段最终都要被服务端值覆盖。
   */
  private Map<String, Object> serverAuthoritative(
      String scene, Long roomId, Long vodId, Long uid) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (roomId != null) {
      out.put("anchor_id", 1_000_000L + roomId);
      out.put("program_title", "直播间 " + roomId + " 当前节目");
      Map<String, Object> play = new LinkedHashMap<>();
      play.put("cdn_node", roomId % 2 == 0 ? "cdn-bj-01" : "cdn-sh-02");
      play.put("drm", false);
      out.put("play", play);
    }
    if (vodId != null) {
      out.put("vod_title", "点播节目 #" + vodId);
    }
    if (uid != null) {
      Map<String, Object> user = new LinkedHashMap<>();
      user.put("uid", uid);
      // M3 起步统一返回普通用户;后续接 membership-svc 真实拉
      user.put("level", "L1");
      user.put("is_minor_guard", false);
      out.put("user", user);
    }
    return out;
  }

  /** 浅合并 — top-level 字段直接覆盖,object-typed 字段二级合并(eg. play、user)。 */
  @SuppressWarnings("unchecked")
  static void shallowMerge(Map<String, Object> base, Map<String, Object> overlay) {
    for (Map.Entry<String, Object> e : overlay.entrySet()) {
      String k = e.getKey();
      Object v = e.getValue();
      Object cur = base.get(k);
      if (v instanceof Map<?, ?> vm && cur instanceof Map<?, ?> cm) {
        Map<String, Object> merged = new LinkedHashMap<>((Map<String, Object>) cm);
        merged.putAll((Map<String, Object>) vm);
        base.put(k, merged);
      } else if (v != null) {
        base.put(k, v);
      }
    }
  }
}
