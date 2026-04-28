package com.aikefu.tool.registry;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ToolContext {
  private String sessionId;
  private Long uid;
  /** 写工具默认 dry_run=true,由用户/坐席二次确认后由 BFF 翻成 false 重跑。 */
  @Builder.Default private boolean dryRun = true;
  private Map<String, Object> liveContext;
  /** 幂等键(仅写操作有意义) */
  private String idempotencyKey;
}
