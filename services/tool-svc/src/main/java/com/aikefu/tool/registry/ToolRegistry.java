package com.aikefu.tool.registry;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/** 进程内工具注册表。线程安全;支持按名查询 / 列表 / OpenAI 协议导出。 */
public class ToolRegistry {

  private final Map<String, Tool> byName = new ConcurrentHashMap<>();

  public ToolRegistry register(Tool t) {
    if (t == null || t.getName() == null || t.getName().isBlank()) {
      throw new IllegalArgumentException("tool requires name");
    }
    if (t.getHandler() == null) {
      throw new IllegalArgumentException("tool requires handler: " + t.getName());
    }
    byName.put(t.getName(), t);
    return this;
  }

  public Tool get(String name) {
    return byName.get(name);
  }

  public List<Tool> all() {
    return List.copyOf(byName.values());
  }

  public Set<String> names() {
    return new LinkedHashSet<>(byName.keySet());
  }

  /** 转成 OpenAI tools 协议(给 ai-hub 透传给 LLM)。 */
  public List<Map<String, Object>> toOpenAi(Set<String> filter) {
    return byName.values().stream()
        .filter(t -> filter == null || filter.isEmpty() || filter.contains(t.getName()))
        .map(t -> {
          Map<String, Object> fn = new LinkedHashMap<>();
          fn.put("name", t.getName());
          fn.put("description", t.getDescription());
          fn.put("parameters", t.getParameters() == null ? Map.of() : t.getParameters());
          return Map.<String, Object>of("type", "function", "function", fn);
        })
        .collect(Collectors.toList());
  }
}
