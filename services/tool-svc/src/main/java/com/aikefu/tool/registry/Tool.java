package com.aikefu.tool.registry;

import java.util.Map;
import java.util.function.BiFunction;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Tool {
  private String name;
  private String description;
  /** OpenAI function-calling JSON Schema(供 ai-hub 透传给 LLM)。 */
  private Map<String, Object> parameters;
  /** 是否写操作 — true 则默认 dry_run=true,需二次确认才能真执行。 */
  @Builder.Default private boolean write = false;
  /** 单次调用上限(ms);0 = 走 svc 默认。 */
  @Builder.Default private long timeoutMs = 0L;
  /** 实际执行函数;不应抛 RuntimeException 给上层(由 ToolRegistry catch 兜底)。 */
  private transient BiFunction<Map<String, Object>, ToolContext, Map<String, Object>> handler;
}
