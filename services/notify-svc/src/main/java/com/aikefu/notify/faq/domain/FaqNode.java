package com.aikefu.notify.faq.domain;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 多级 FAQ 树节点。
 *
 * <p>分类节点(is_leaf=false)只有 children;叶子节点(is_leaf=true)必有 answer。
 * synonyms 用于"相似匹配"通道(详见 PRD 03-AI 中枢-需求.md §2.3)。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FaqNode {
  private String id;
  private String title;
  private String icon;
  @Builder.Default private int sortOrder = 0;
  @Builder.Default private boolean isLeaf = false;

  /** 同义问列表(命中相似匹配时用)。 */
  @Builder.Default private List<String> synonyms = new ArrayList<>();

  /** 叶子节点的预设答案(非叶子为 null)。 */
  private FaqAnswer answer;

  /** 子节点(分类节点用)。 */
  @Builder.Default private List<FaqNode> children = new ArrayList<>();

  public boolean hasChildren() {
    return children != null && !children.isEmpty();
  }
}
