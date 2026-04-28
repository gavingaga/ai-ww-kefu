package com.aikefu.tool.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.tool.registry.Tool;
import com.aikefu.tool.registry.ToolContext;
import com.aikefu.tool.registry.ToolRegistry;
import com.aikefu.tool.service.ToolExecutor;

@RestController
@RequestMapping("/v1/tools")
public class ToolController {

  private final ToolRegistry registry;
  private final ToolExecutor executor;

  public ToolController(ToolRegistry registry, ToolExecutor executor) {
    this.registry = registry;
    this.executor = executor;
  }

  @GetMapping("/healthz")
  public Map<String, Object> healthz() {
    return Map.of("status", "ok", "tools", registry.names());
  }

  @GetMapping
  public List<Map<String, Object>> list() {
    return registry.all().stream()
        .map(t -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("name", t.getName());
          m.put("description", t.getDescription());
          m.put("write", t.isWrite());
          m.put("timeout_ms", t.getTimeoutMs());
          m.put("parameters", t.getParameters());
          return m;
        })
        .toList();
  }

  /** OpenAI tools 协议导出 — 给 ai-hub 透传给 LLM。 */
  @GetMapping("/openai")
  public List<Map<String, Object>> openai(
      @RequestParam(value = "names", required = false) List<String> names) {
    return registry.toOpenAi(names == null ? null : new java.util.LinkedHashSet<>(names));
  }

  @PostMapping("/{name}/invoke")
  public ResponseEntity<Map<String, Object>> invoke(
      @PathVariable("name") String name, @RequestBody Map<String, Object> body) {
    Tool t = registry.get(name);
    if (t == null) {
      return ResponseEntity.status(404)
          .body(Map.of("ok", false, "error", "tool not found: " + name));
    }
    Map<String, Object> args = asMap(body.get("args"));
    Map<String, Object> ctxMap = asMap(body.get("ctx"));
    ToolContext ctx =
        ToolContext.builder()
            .sessionId(asStr(ctxMap.get("session_id")))
            .uid(asLong(ctxMap.get("uid")))
            .dryRun(parseDryRun(ctxMap.get("dry_run"), t.isWrite()))
            .liveContext(asMap(ctxMap.get("live_context")))
            .idempotencyKey(asStr(ctxMap.get("idempotency_key")))
            .build();
    return ResponseEntity.ok(executor.invoke(name, args, ctx));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asMap(Object v) {
    return v instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
  }

  private static String asStr(Object v) {
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

  /** 写操作默认 dry_run=true,除非显式传 false。 */
  private static boolean parseDryRun(Object v, boolean isWrite) {
    if (v == null) return isWrite;
    if (v instanceof Boolean b) return b;
    return Boolean.parseBoolean(String.valueOf(v));
  }
}
