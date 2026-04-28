package com.aikefu.notify.faq.domain;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 多级 FAQ 树。每个 scene(welcome / aftersale / play / membership ...)一棵树。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FaqTree {
  private String id;
  /** 与 PRD 02-C 端 §3.5 对齐:welcome / play / aftersale / membership ... */
  private String scene;
  @Builder.Default private int version = 1;
  @Builder.Default private List<FaqNode> nodes = new ArrayList<>();
}
