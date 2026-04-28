package com.aikefu.routing.web.dto;

import java.util.Map;

public record EnqueueRequest(
    String sessionId, Long tenantId, String skillGroup, Map<String, Object> packet) {}
