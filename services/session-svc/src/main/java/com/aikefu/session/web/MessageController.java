package com.aikefu.session.web;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.session.domain.Message;
import com.aikefu.session.service.MessageService;
import com.aikefu.session.web.dto.AppendMessageRequest;
import com.aikefu.session.web.dto.HistoryResponse;

@RestController
@RequestMapping("/v1/sessions/{id}/messages")
public class MessageController {

  private static final int DEFAULT_LIMIT = 30;
  private static final int MAX_LIMIT = 100;

  private final MessageService messageService;

  public MessageController(MessageService messageService) {
    this.messageService = messageService;
  }

  /** 重连补漏 — 拉 seq > since 的增量(升序),便于客户端从 lastSeq 一键续上。 */
  @GetMapping("/since")
  public Map<String, Object> since(
      @PathVariable("id") String id,
      @RequestParam(value = "seq", defaultValue = "0") long since,
      @RequestParam(value = "limit", defaultValue = "200") int limit) {
    List<Message> items = messageService.since(id, since, limit);
    long lastSeq = items.isEmpty() ? since : items.get(items.size() - 1).getSeq();
    return Map.of("items", items, "last_seq", lastSeq, "has_more", items.size() == Math.min(limit, 200));
  }

  /** 历史分页(seq 倒序)。 */
  @GetMapping
  public HistoryResponse history(
      @PathVariable("id") String id,
      @RequestParam(value = "before", defaultValue = "0") long before,
      @RequestParam(value = "limit", defaultValue = "30") int limit) {
    int safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    if (limit <= 0) safeLimit = DEFAULT_LIMIT;
    List<Message> items = messageService.history(id, before, safeLimit);
    boolean hasMore = items.size() == safeLimit;
    return new HistoryResponse(items, hasMore);
  }

  /** 写入一条消息(WS 不可用时降级)。 */
  @PostMapping
  public ResponseEntity<Message> append(
      @PathVariable("id") String id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      @Valid @RequestBody AppendMessageRequest req) {
    String clientMsgId = req.clientMsgId() != null ? req.clientMsgId() : idempotencyKey;
    Map<String, Object> content = req.content() == null ? Map.of() : req.content();
    Message m =
        messageService.append(
            id,
            clientMsgId,
            req.role() != null ? req.role() : "user",
            req.type(),
            content,
            req.aiMeta());
    return ResponseEntity.status(HttpStatus.CREATED).body(m);
  }
}
