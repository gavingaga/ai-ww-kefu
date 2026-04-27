package com.aikefu.session.web.dto;

import java.util.List;

import com.aikefu.session.domain.Message;

public record HistoryResponse(List<Message> items, boolean hasMore) {}
