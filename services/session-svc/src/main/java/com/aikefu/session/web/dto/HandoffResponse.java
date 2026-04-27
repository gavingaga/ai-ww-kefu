package com.aikefu.session.web.dto;

public record HandoffResponse(String sessionId, int position, int etaSeconds) {}
