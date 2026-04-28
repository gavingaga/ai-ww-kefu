package com.aikefu.notify.faq.match;

import com.aikefu.notify.faq.domain.FaqNode;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 一次匹配尝试的结果。 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class MatchResult {
  /** "exact" / "similar" / "none" */
  private String how;
  private FaqNode node;
  private double score;

  public static MatchResult exact(FaqNode node) {
    return new MatchResult("exact", node, 1.0);
  }

  public static MatchResult similar(FaqNode node, double score) {
    return new MatchResult("similar", node, score);
  }

  public static MatchResult none() {
    return new MatchResult("none", null, 0d);
  }

  public boolean isHit() {
    return node != null;
  }
}
