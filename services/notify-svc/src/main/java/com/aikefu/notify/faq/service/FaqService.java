package com.aikefu.notify.faq.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.aikefu.notify.faq.domain.FaqNode;
import com.aikefu.notify.faq.domain.FaqTree;
import com.aikefu.notify.faq.match.MatchResult;
import com.aikefu.notify.faq.match.Tokenizer;
import com.aikefu.notify.faq.persistence.FaqRepository;

/** FAQ 业务入口:树查询 + 精确 / 相似匹配 + 命中埋点。 */
@Service
public class FaqService {

  private final FaqRepository repo;

  /** 嵌入相似度阈值(供 ai-hub 调嵌入侧使用,这里保留接口,本服务暂不直接依赖嵌入)。 */
  private final double similarityThreshold;

  /** token-overlap 阈值(无嵌入时的兜底通道)。 */
  private final double overlapThreshold;

  public FaqService(
      FaqRepository repo,
      @Value("${aikefu.faq.similarity-threshold:0.86}") double similarityThreshold,
      @Value("${aikefu.faq.overlap-threshold:0.55}") double overlapThreshold) {
    this.repo = repo;
    this.similarityThreshold = similarityThreshold;
    this.overlapThreshold = overlapThreshold;
  }

  public Optional<FaqTree> getTree(String scene) {
    return repo.findByScene(scene);
  }

  public List<FaqNode> getChildren(String nodeId) {
    return repo.findNodeById(nodeId).map(FaqNode::getChildren).orElse(List.of());
  }

  public Optional<FaqNode> getNode(String nodeId) {
    return repo.findNodeById(nodeId);
  }

  /** 命中埋点。 */
  public void recordHit(String nodeId) {
    repo.incrementHit(nodeId);
  }

  public long hitCount(String nodeId) {
    return repo.hitCount(nodeId);
  }

  /**
   * 精确 + 相似匹配。优先 exact;否则在所有叶子的 title + synonyms 上跑 token-overlap。
   *
   * @param query 用户输入
   * @return MatchResult,未命中返回 {@link MatchResult#none()}
   */
  public MatchResult match(String query) {
    if (query == null || query.isBlank()) return MatchResult.none();
    String norm = query.trim();
    List<FaqNode> leaves = repo.allLeaves();
    if (leaves.isEmpty()) return MatchResult.none();

    // 1) Exact:title 完全相等(忽略大小写)或命中 synonyms
    for (FaqNode leaf : leaves) {
      if (norm.equalsIgnoreCase(leaf.getTitle())) {
        return MatchResult.exact(leaf);
      }
      if (leaf.getSynonyms() != null) {
        for (String syn : leaf.getSynonyms()) {
          if (norm.equalsIgnoreCase(syn)) return MatchResult.exact(leaf);
        }
      }
    }

    // 2) Similar:token-overlap 取最高分
    Set<String> qTokens = Tokenizer.tokenize(norm);
    if (qTokens.isEmpty()) return MatchResult.none();
    FaqNode best = null;
    double bestScore = 0d;
    for (FaqNode leaf : leaves) {
      double s = bestOverlap(qTokens, leaf);
      if (s > bestScore) {
        bestScore = s;
        best = leaf;
      }
    }
    if (best != null && bestScore >= overlapThreshold) {
      return MatchResult.similar(best, bestScore);
    }
    return MatchResult.none();
  }

  private double bestOverlap(Set<String> qTokens, FaqNode leaf) {
    double s = Tokenizer.overlapCoef(qTokens, Tokenizer.tokenize(leaf.getTitle()));
    if (leaf.getSynonyms() != null) {
      for (String syn : leaf.getSynonyms()) {
        double v = Tokenizer.overlapCoef(qTokens, Tokenizer.tokenize(syn));
        if (v > s) s = v;
      }
    }
    return s;
  }

  // 暴露阈值给 admin / 监控
  public double similarityThreshold() {
    return similarityThreshold;
  }

  public double overlapThreshold() {
    return overlapThreshold;
  }

  /** 列出全部树(admin 用)。 */
  public List<FaqTree> all() {
    return new ArrayList<>(repo.all());
  }

  /** 整树保存(admin 用),自动 +1 版本号。 */
  public FaqTree saveTree(FaqTree tree) {
    int next = repo.findByScene(tree.getScene()).map(t -> t.getVersion() + 1).orElse(1);
    tree.setVersion(next);
    repo.save(tree);
    return tree;
  }
}
