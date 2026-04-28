package com.aikefu.tool.tools;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.aikefu.tool.clients.LivectxRpc;
import com.aikefu.tool.registry.Tool;
import com.aikefu.tool.registry.ToolRegistry;

/**
 * 出厂工具集。M3 起步:
 *
 * <ul>
 *   <li>{@code get_play_diagnostics}(T-222) — 基于 livectx-svc 合并后的 play / network 推断
 *   <li>{@code get_room_info} / {@code get_vod_info}(T-223)— mock 直播间 / 节目元数据
 *   <li>{@code get_membership} / {@code get_subscription_orders} / {@code cancel_subscription}
 *       (T-224)— 写工具默认 dry_run
 *   <li>{@code report_content}(T-225)— 内容举报留痕
 *   <li>{@code get_anchor_info}(T-226)— 主播信息
 * </ul>
 *
 * 真实业务系统对接由各 owner 替换 handler;参数 schema / dry_run 语义不变。
 */
public final class DefaultTools {

  private DefaultTools() {}

  public static ToolRegistry register(ToolRegistry reg, LivectxRpc livectx) {
    reg.register(getPlayDiagnostics(livectx));
    reg.register(getRoomInfo(livectx));
    reg.register(getVodInfo(livectx));
    reg.register(getMembership());
    reg.register(getSubscriptionOrders());
    reg.register(cancelSubscription());
    reg.register(reportContent());
    reg.register(getAnchorInfo());
    return reg;
  }

  // ───── T-222 ─────

  private static Tool getPlayDiagnostics(LivectxRpc livectx) {
    return Tool.builder()
        .name("get_play_diagnostics")
        .description("拉取当前直播间 / 点播节目的播放诊断(QoE + 网络)。播放问题排查必先调用。")
        .parameters(
            Map.of(
                "type", "object",
                "properties",
                    Map.of(
                        "room_id", Map.of("type", "integer", "description", "直播间 ID"),
                        "vod_id", Map.of("type", "integer", "description", "点播节目 ID")),
                "additionalProperties", false))
        .write(false)
        .timeoutMs(2000)
        .handler(
            (args, ctx) -> {
              Long roomId = numAsLong(args.get("room_id"));
              Long vodId = numAsLong(args.get("vod_id"));
              Map<String, Object> lc =
                  livectx.resolve(
                      roomId != null ? "live_room" : "vod_detail", roomId, vodId, null);
              Map<String, Object> play = asMap(lc == null ? null : lc.get("play"));
              Map<String, Object> network = asMap(lc == null ? null : lc.get("network"));
              int bufferEvents = asInt(play.get("buffer_events_60s"), 0);
              int firstFrameMs = asInt(play.get("first_frame_ms"), 0);
              String quality = String.valueOf(play.getOrDefault("quality", "auto"));
              String netType = String.valueOf(network.getOrDefault("type", "unknown"));
              int rtt = asInt(network.get("rtt_ms"), 0);
              String verdict;
              String summary;
              if (bufferEvents >= 5 || rtt >= 400) {
                verdict = "local_network";
                summary = "本地网络偏弱,建议切到 480p 或换 Wi-Fi/4G。";
              } else if (firstFrameMs > 4000) {
                verdict = "cdn";
                summary = "首屏加载偏慢,可能是 CDN/源站,建议退出直播间重进。";
              } else if (play.get("last_error_code") != null
                  && String.valueOf(play.get("last_error_code")).startsWith("auth")) {
                verdict = "auth";
                summary = "鉴权异常,请检查登录态。";
              } else {
                verdict = "unknown";
                summary = "未发现明显问题,可尝试切换清晰度。";
              }
              Map<String, Object> result = new LinkedHashMap<>();
              result.put("verdict", verdict);
              result.put("summary", summary);
              result.put(
                  "snapshot",
                  Map.of(
                      "quality", quality,
                      "buffer_events_60s", bufferEvents,
                      "first_frame_ms", firstFrameMs,
                      "network_type", netType,
                      "rtt_ms", rtt,
                      "cdn_node", String.valueOf(play.getOrDefault("cdn_node", "unknown"))));
              return result;
            })
        .build();
  }

  // ───── T-223 ─────

  private static Tool getRoomInfo(LivectxRpc livectx) {
    return Tool.builder()
        .name("get_room_info")
        .description("查询直播间信息(主播 / 当前节目 / 在线人数 mock)。")
        .parameters(
            Map.of(
                "type", "object",
                "properties", Map.of("room_id", Map.of("type", "integer")),
                "required", List.of("room_id"),
                "additionalProperties", false))
        .handler(
            (args, ctx) -> {
              Long roomId = numAsLong(args.get("room_id"));
              if (roomId == null) throw new IllegalArgumentException("room_id required");
              Map<String, Object> lc = livectx.resolve("live_room", roomId, null, null);
              Map<String, Object> result = new LinkedHashMap<>();
              result.put("room_id", roomId);
              result.put("anchor_id", lc == null ? null : lc.get("anchor_id"));
              result.put("program_title", lc == null ? null : lc.get("program_title"));
              // mock 在线人数 — 后续接 livestream-svc
              result.put("audience_count", (int) ((roomId * 7919L) % 50_000L));
              result.put("category", "live");
              return result;
            })
        .build();
  }

  private static Tool getVodInfo(LivectxRpc livectx) {
    return Tool.builder()
        .name("get_vod_info")
        .description("查询点播节目信息(标题 / 时长 / 是否会员专享 mock)。")
        .parameters(
            Map.of(
                "type", "object",
                "properties", Map.of("vod_id", Map.of("type", "integer")),
                "required", List.of("vod_id"),
                "additionalProperties", false))
        .handler(
            (args, ctx) -> {
              Long vodId = numAsLong(args.get("vod_id"));
              if (vodId == null) throw new IllegalArgumentException("vod_id required");
              Map<String, Object> lc = livectx.resolve("vod_detail", null, vodId, null);
              Map<String, Object> result = new LinkedHashMap<>();
              result.put("vod_id", vodId);
              result.put("title", lc == null ? null : lc.get("vod_title"));
              result.put("duration_sec", 60 + (int) (vodId % 7200));
              result.put("vip_only", vodId % 5 == 0);
              return result;
            })
        .build();
  }

  // ───── T-224 ─────

  private static Tool getMembership() {
    return Tool.builder()
        .name("get_membership")
        .description("查询用户会员等级 / 订阅 / 自动续费状态。")
        .parameters(
            Map.of(
                "type", "object",
                "properties", Map.of("uid", Map.of("type", "integer")),
                "required", List.of("uid"),
                "additionalProperties", false))
        .handler(
            (args, ctx) -> {
              Long uid = numAsLong(args.get("uid"));
              if (uid == null) throw new IllegalArgumentException("uid required");
              Map<String, Object> r = new LinkedHashMap<>();
              r.put("uid", uid);
              r.put("level", uid % 4 == 0 ? "VIP3" : uid % 2 == 0 ? "VIP1" : "L1");
              r.put("auto_renew", uid % 3 != 0);
              r.put("expires_at", "2026-12-31T23:59:59Z");
              return r;
            })
        .build();
  }

  private static Tool getSubscriptionOrders() {
    return Tool.builder()
        .name("get_subscription_orders")
        .description("查询用户最近订阅订单。")
        .parameters(
            Map.of(
                "type", "object",
                "properties", Map.of(
                    "uid", Map.of("type", "integer"),
                    "limit", Map.of("type", "integer", "minimum", 1, "maximum", 20)),
                "required", List.of("uid"),
                "additionalProperties", false))
        .handler(
            (args, ctx) -> {
              Long uid = numAsLong(args.get("uid"));
              if (uid == null) throw new IllegalArgumentException("uid required");
              int limit = asInt(args.get("limit"), 5);
              List<Map<String, Object>> orders = new java.util.ArrayList<>();
              for (int i = 0; i < limit; i++) {
                orders.add(
                    Map.of(
                        "order_id", "ord_" + uid + "_" + (1000 + i),
                        "amount_yuan", 30 + i * 10,
                        "channel", i % 2 == 0 ? "ios" : "android",
                        "status", i == 0 ? "active" : "expired"));
              }
              return Map.of("uid", uid, "orders", orders);
            })
        .build();
  }

  private static Tool cancelSubscription() {
    return Tool.builder()
        .name("cancel_subscription")
        .description("取消用户的连续订阅。**写操作**,默认 dry_run。")
        .parameters(
            Map.of(
                "type", "object",
                "properties",
                    Map.of(
                        "uid", Map.of("type", "integer"),
                        "sub_id", Map.of("type", "string"),
                        "reason", Map.of("type", "string")),
                "required", List.of("uid", "sub_id"),
                "additionalProperties", false))
        .write(true)
        .handler(
            (args, ctx) -> {
              // dry_run 已被 ToolExecutor 短路;此处即真执行路径
              return Map.of(
                  "ok", true,
                  "executed", true,
                  "uid", args.get("uid"),
                  "sub_id", args.get("sub_id"),
                  "canceled_at", java.time.Instant.now().toString());
            })
        .build();
  }

  // ───── T-225 / T-226 ─────

  private static Tool reportContent() {
    return Tool.builder()
        .name("report_content")
        .description("登记内容举报(写操作,留痕)。")
        .parameters(
            Map.of(
                "type", "object",
                "properties",
                    Map.of(
                        "target_type", Map.of(
                            "type", "string",
                            "enum", List.of("room", "vod", "comment", "anchor")),
                        "target_id", Map.of("type", "string"),
                        "category", Map.of(
                            "type", "string",
                            "enum", List.of("porn", "abuse", "copyright", "minor", "other")),
                        "evidence_url", Map.of("type", "string")),
                "required", List.of("target_type", "target_id", "category"),
                "additionalProperties", false))
        .write(true)
        .handler(
            (args, ctx) ->
                Map.of(
                    "ok", true,
                    "report_id",
                        "rep_"
                            + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                    "target", Map.of("type", args.get("target_type"), "id", args.get("target_id")),
                    "filed_at", java.time.Instant.now().toString()))
        .build();
  }

  private static Tool getAnchorInfo() {
    return Tool.builder()
        .name("get_anchor_info")
        .description("查询主播简要信息(等级 / 实名 / 当前直播间)。")
        .parameters(
            Map.of(
                "type", "object",
                "properties", Map.of("anchor_id", Map.of("type", "integer")),
                "required", List.of("anchor_id"),
                "additionalProperties", false))
        .handler(
            (args, ctx) -> {
              Long aid = numAsLong(args.get("anchor_id"));
              if (aid == null) throw new IllegalArgumentException("anchor_id required");
              return Map.of(
                  "anchor_id", aid,
                  "nickname", "主播#" + aid,
                  "verified", aid % 7 != 0,
                  "current_room_id", aid - 1_000_000L);
            })
        .build();
  }

  // ───── helpers ─────

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asMap(Object v) {
    return v instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
  }

  private static Long numAsLong(Object v) {
    if (v == null) return null;
    if (v instanceof Number n) return n.longValue();
    try {
      return Long.parseLong(String.valueOf(v));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static int asInt(Object v, int def) {
    if (v instanceof Number n) return n.intValue();
    if (v == null) return def;
    try {
      return Integer.parseInt(String.valueOf(v));
    } catch (NumberFormatException e) {
      return def;
    }
  }
}
