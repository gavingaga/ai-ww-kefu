package com.aikefu.routing.persistence;

import java.util.List;
import java.util.Optional;

import com.aikefu.routing.domain.QueueEntry;

/** 排队仓储 — M1 内存,M2 后接 Redis Sorted Set。 */
public interface QueueRepository {

  void enqueue(QueueEntry entry);

  /** 按入队时间升序列出某技能组的全部条目(不移除)。 */
  List<QueueEntry> list(String skillGroup);

  /** 列出全部技能组的全部条目(用于 admin / 监控)。 */
  List<QueueEntry> listAll();

  Optional<QueueEntry> findById(String entryId);

  /** 移除并返回对应条目。 */
  Optional<QueueEntry> remove(String entryId);

  /** 把 entry 从原 group 转到目标 group(溢出场景)。 */
  Optional<QueueEntry> move(String entryId, String toSkillGroup);

  int size(String skillGroup);
}
