package com.aikefu.notify.faq.persistence;

import java.util.List;
import java.util.Optional;

import com.aikefu.notify.faq.domain.FaqNode;
import com.aikefu.notify.faq.domain.FaqTree;

/** FAQ 仓储。M1 内存实现,M2 后接 MySQL faq_tree / faq_node 表。 */
public interface FaqRepository {

  void save(FaqTree tree);

  Optional<FaqTree> findByScene(String scene);

  Optional<FaqNode> findNodeById(String nodeId);

  List<FaqNode> allLeaves();

  List<FaqTree> all();

  /** 命中计数:埋点最小动作。 */
  void incrementHit(String nodeId);

  long hitCount(String nodeId);
}
