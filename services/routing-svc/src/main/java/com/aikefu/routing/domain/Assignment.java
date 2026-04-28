package com.aikefu.routing.domain;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 一次派单结果 — 把 QueueEntry 关联到 Agent。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Assignment {
  private String entryId;
  private String sessionId;
  private long agentId;
  private String skillGroup;
  private Instant assignedAt;
}
