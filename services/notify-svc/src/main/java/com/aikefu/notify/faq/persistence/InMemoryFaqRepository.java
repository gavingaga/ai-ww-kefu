package com.aikefu.notify.faq.persistence;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Repository;

import com.aikefu.notify.faq.domain.FaqNode;
import com.aikefu.notify.faq.domain.FaqTree;

/** M1 内存实现 — 仅本节点可见,M2 替换为 MySQL。 */
@Repository
public class InMemoryFaqRepository implements FaqRepository {

  private final ConcurrentMap<String, FaqTree> bySceneScene = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, FaqNode> byNodeId = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, AtomicLong> hits = new ConcurrentHashMap<>();

  @Override
  public synchronized void save(FaqTree tree) {
    bySceneScene.put(tree.getScene(), tree);
    Map<String, FaqNode> indexed = new ConcurrentHashMap<>();
    for (FaqNode root : tree.getNodes()) {
      indexNode(root, indexed);
    }
    // 简单替换:删除旧索引中属于本树的节点比较麻烦,
    // M1 内存做法是直接整体重建索引(单租户单进程下无并发污染)。
    byNodeId.putAll(indexed);
  }

  private void indexNode(FaqNode node, Map<String, FaqNode> indexed) {
    if (node.getId() != null) {
      indexed.put(node.getId(), node);
    }
    if (node.getChildren() != null) {
      for (FaqNode child : node.getChildren()) {
        indexNode(child, indexed);
      }
    }
  }

  @Override
  public Optional<FaqTree> findByScene(String scene) {
    return Optional.ofNullable(bySceneScene.get(scene));
  }

  @Override
  public Optional<FaqNode> findNodeById(String nodeId) {
    return Optional.ofNullable(byNodeId.get(nodeId));
  }

  @Override
  public List<FaqNode> allLeaves() {
    List<FaqNode> out = new ArrayList<>();
    for (FaqNode n : byNodeId.values()) {
      if (n.isLeaf()) out.add(n);
    }
    return out;
  }

  @Override
  public List<FaqTree> all() {
    return new ArrayList<>(bySceneScene.values());
  }

  @Override
  public void incrementHit(String nodeId) {
    hits.computeIfAbsent(nodeId, k -> new AtomicLong()).incrementAndGet();
  }

  @Override
  public long hitCount(String nodeId) {
    AtomicLong l = hits.get(nodeId);
    return l == null ? 0L : l.get();
  }
}
