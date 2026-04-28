package com.aikefu.routing.persistence;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.stereotype.Repository;

import com.aikefu.routing.domain.Agent;

@Repository
public class InMemoryAgentRepository implements AgentRepository {

  private final ConcurrentMap<Long, Agent> byId = new ConcurrentHashMap<>();

  @Override
  public Agent save(Agent agent) {
    byId.put(agent.getId(), agent);
    return agent;
  }

  @Override
  public Optional<Agent> findById(long id) {
    return Optional.ofNullable(byId.get(id));
  }

  @Override
  public List<Agent> all() {
    return new ArrayList<>(byId.values());
  }

  @Override
  public List<Agent> findBySkillGroup(String skillGroup) {
    if (skillGroup == null || skillGroup.isBlank()) return List.of();
    return byId.values().stream()
        .filter(a -> a.getSkillGroups() != null && a.getSkillGroups().contains(skillGroup))
        .toList();
  }
}
