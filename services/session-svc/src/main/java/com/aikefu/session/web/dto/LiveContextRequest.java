package com.aikefu.session.web.dto;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;

/**
 * 接收 live_context 任意字段(M1 阶段不强校验,M2 起接 jsonschema 校验)。
 *
 * <p>schema 来源:packages/proto/live-context/live-context.schema.json v1。
 */
public class LiveContextRequest {
  private final Map<String, Object> fields = new HashMap<>();

  @JsonAnySetter
  public void put(String key, Object value) {
    fields.put(key, value);
  }

  @JsonAnyGetter
  public Map<String, Object> getFields() {
    return fields;
  }

  public Map<String, Object> toMap() {
    return Map.copyOf(fields);
  }
}
