package com.aikefu.routing.persistence;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.stereotype.Repository;

import com.aikefu.routing.domain.QueueEntry;

@Repository
public class InMemoryQueueRepository implements QueueRepository {

  /** skill_group → entry_id → entry */
  private final ConcurrentMap<String, ConcurrentMap<String, QueueEntry>> byGroup =
      new ConcurrentHashMap<>();

  /** entry_id → entry(全局索引) */
  private final ConcurrentMap<String, QueueEntry> byId = new ConcurrentHashMap<>();

  @Override
  public void enqueue(QueueEntry entry) {
    byGroup.computeIfAbsent(entry.getSkillGroup(), k -> new ConcurrentHashMap<>())
        .put(entry.getId(), entry);
    byId.put(entry.getId(), entry);
  }

  @Override
  public List<QueueEntry> list(String skillGroup) {
    Map<String, QueueEntry> bucket = byGroup.get(skillGroup);
    if (bucket == null) return List.of();
    return bucket.values().stream()
        .sorted(Comparator.comparing(QueueEntry::getEnqueuedAt))
        .toList();
  }

  @Override
  public List<QueueEntry> listAll() {
    List<QueueEntry> out = new ArrayList<>(byId.values());
    out.sort(Comparator.comparing(QueueEntry::getEnqueuedAt));
    return out;
  }

  @Override
  public Optional<QueueEntry> findById(String entryId) {
    return Optional.ofNullable(byId.get(entryId));
  }

  @Override
  public synchronized Optional<QueueEntry> remove(String entryId) {
    QueueEntry e = byId.remove(entryId);
    if (e == null) return Optional.empty();
    Map<String, QueueEntry> bucket = byGroup.get(e.getSkillGroup());
    if (bucket != null) bucket.remove(entryId);
    return Optional.of(e);
  }

  @Override
  public synchronized Optional<QueueEntry> move(String entryId, String toSkillGroup) {
    QueueEntry e = byId.get(entryId);
    if (e == null) return Optional.empty();
    Map<String, QueueEntry> oldBucket = byGroup.get(e.getSkillGroup());
    if (oldBucket != null) oldBucket.remove(entryId);
    e.setSkillGroup(toSkillGroup);
    e.setOverflowed(true);
    byGroup.computeIfAbsent(toSkillGroup, k -> new ConcurrentHashMap<>()).put(entryId, e);
    return Optional.of(e);
  }

  @Override
  public int size(String skillGroup) {
    Map<String, QueueEntry> bucket = byGroup.get(skillGroup);
    return bucket == null ? 0 : bucket.size();
  }
}
