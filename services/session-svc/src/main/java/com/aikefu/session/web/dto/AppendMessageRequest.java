package com.aikefu.session.web.dto;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;

/** 写入消息请求体。 */
public record AppendMessageRequest(
    String clientMsgId,
    String role,
    @NotBlank String type,
    Map<String, Object> content,
    Map<String, Object> aiMeta) {}
