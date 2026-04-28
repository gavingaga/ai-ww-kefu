package com.aikefu.routing.persistence;

import java.util.List;
import java.util.Optional;

import com.aikefu.routing.domain.Agent;

public interface AgentRepository {
  Agent save(Agent agent);

  Optional<Agent> findById(long id);

  List<Agent> all();

  /** 列出能接 ``skillGroup`` 的全部坐席(不限状态)。 */
  List<Agent> findBySkillGroup(String skillGroup);
}
