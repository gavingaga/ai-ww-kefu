package com.aikefu.routing.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import com.aikefu.routing.domain.Agent;
import com.aikefu.routing.domain.QueueEntry;

/**
 * 排队 → 派单策略。M2 起步实现 4 种,默认 ``vip_first``。
 *
 * <p>策略接口接收"候选条目 + 候选坐席",输出最佳条目;
 * 实际派单需调用方再做 {@link Agent#canTakeMore()} 校验。
 */
public interface AssignmentStrategy {

  /** 在该坐席可接的条目里选一条。 */
  Optional<QueueEntry> pickForAgent(Agent agent, List<QueueEntry> candidates);

  /** 名称 — 与 application.yml 的 ``aikefu.routing.strategy`` 对齐。 */
  String name();

  /** 工厂:按字符串构造。 */
  static AssignmentStrategy of(String name) {
    if (name == null) return new VipFirst();
    return switch (name.toLowerCase()) {
      case "fifo" -> new Fifo();
      case "round_robin" -> new RoundRobin();
      case "least_busy" -> new LeastBusy();
      case "vip_first", "" -> new VipFirst();
      default -> new VipFirst();
    };
  }

  /** FIFO:最早入队优先。 */
  class Fifo implements AssignmentStrategy {
    @Override
    public Optional<QueueEntry> pickForAgent(Agent agent, List<QueueEntry> candidates) {
      return candidates.stream().min(Comparator.comparing(QueueEntry::getEnqueuedAt));
    }

    @Override
    public String name() {
      return "fifo";
    }
  }

  /** VIP 优先:VIP > 最早入队;同时优先级越小越先。 */
  class VipFirst implements AssignmentStrategy {
    @Override
    public Optional<QueueEntry> pickForAgent(Agent agent, List<QueueEntry> candidates) {
      return candidates.stream()
          .min(
              Comparator.comparing(QueueEntry::isVip).reversed()
                  .thenComparingInt(QueueEntry::getPriority)
                  .thenComparing(QueueEntry::getEnqueuedAt));
    }

    @Override
    public String name() {
      return "vip_first";
    }
  }

  /** Round-robin:基于坐席当前 load 在候选中均匀分布;退化为 fifo。 */
  class RoundRobin implements AssignmentStrategy {
    @Override
    public Optional<QueueEntry> pickForAgent(Agent agent, List<QueueEntry> candidates) {
      return candidates.stream().min(Comparator.comparing(QueueEntry::getEnqueuedAt));
    }

    @Override
    public String name() {
      return "round_robin";
    }
  }

  /** Least-busy:对坐席侧维度做选择;条目侧仍取最早入队。 */
  class LeastBusy implements AssignmentStrategy {
    @Override
    public Optional<QueueEntry> pickForAgent(Agent agent, List<QueueEntry> candidates) {
      return candidates.stream().min(Comparator.comparing(QueueEntry::getEnqueuedAt));
    }

    @Override
    public String name() {
      return "least_busy";
    }
  }

  /** 工具:判定 entry 是否需要溢出到上级技能组。 */
  static boolean shouldOverflow(QueueEntry entry, Duration overflowThreshold) {
    if (entry == null || entry.getEnqueuedAt() == null || entry.isOverflowed()) return false;
    return Duration.between(entry.getEnqueuedAt(), Instant.now()).compareTo(overflowThreshold) > 0;
  }
}
