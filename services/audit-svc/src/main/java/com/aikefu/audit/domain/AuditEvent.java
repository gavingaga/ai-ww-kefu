package com.aikefu.audit.domain;

import java.time.Instant;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 审计事件 — 单条不可变记录(写入后由查询端只读消费)。
 *
 * <p>kind 推荐值(可扩展):
 *
 * <ul>
 *   <li>session.accept / session.close / session.transfer_to_ai
 *   <li>supervisor.observe / supervisor.unobserve
 *   <li>supervisor.transfer / supervisor.steal / supervisor.whisper
 *   <li>kb.ingest / kb.delete / faq.tree_save
 *   <li>tool.write_confirmed / tool.write_canceled
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuditEvent {
  private String id;
  private Instant ts;
  /** kind 字段;eg. "supervisor.transfer" */
  private String kind;
  /** 行为发起者 — 主管 / 坐席 / 系统 */
  private Actor actor;
  /** 涉及的会话 id;非会话相关动作可空(eg. kb.ingest) */
  private String sessionId;
  /** 目标对象 — 转给的坐席 id / 写工具名 / kb doc id 等 */
  private String target;
  /** 简短动作描述(给运营快速浏览) */
  private String action;
  /** 操作前后的简化快照,用于回放与差异比较 */
  private Map<String, Object> before;
  private Map<String, Object> after;
  /** 客户端 IP / UA(管理后台 / agent-bff 透传) */
  private String ip;
  private String userAgent;
  /** 其他键值(reason / score / 自由扩展) */
  private Map<String, Object> meta;

  @Data
  @Builder
  @NoArgsConstructor
  @AllArgsConstructor
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public static class Actor {
    private Long id;
    /** AGENT / SUPERVISOR / SYSTEM / ADMIN */
    private String role;
    private String nickname;
  }
}
