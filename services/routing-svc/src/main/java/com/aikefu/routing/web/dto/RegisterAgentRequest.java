package com.aikefu.routing.web.dto;

import java.util.List;

import com.aikefu.routing.domain.AgentRole;
import com.aikefu.routing.domain.AgentStatus;

public record RegisterAgentRequest(
    long id,
    String nickname,
    String avatarUrl,
    List<String> skillGroups,
    Integer maxConcurrency,
    AgentStatus status,
    AgentRole role) {}
