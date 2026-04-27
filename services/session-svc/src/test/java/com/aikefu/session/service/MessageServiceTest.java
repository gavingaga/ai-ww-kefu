package com.aikefu.session.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.aikefu.session.domain.Message;
import com.aikefu.session.domain.Session;
import com.aikefu.session.persistence.InMemoryMessageRepository;
import com.aikefu.session.persistence.InMemorySessionRepository;

class MessageServiceTest {

  private SessionService sessionService;
  private MessageService messageService;

  @BeforeEach
  void setUp() {
    sessionService = new SessionService(new InMemorySessionRepository(), new SessionStateMachine());
    messageService = new MessageService(new InMemoryMessageRepository(), sessionService);
  }

  @Test
  void appendAssignsIncreasingSeq() {
    Session s = sessionService.getOrCreateCurrent(1L, 100L, "web_h5", null);
    Message m1 =
        messageService.append(s.getId(), "c-1", "user", "text", Map.of("text", "hi"), null);
    Message m2 =
        messageService.append(s.getId(), "c-2", "user", "text", Map.of("text", "yo"), null);
    assertThat(m1.getSeq()).isEqualTo(1);
    assertThat(m2.getSeq()).isEqualTo(2);
  }

  @Test
  void duplicateClientMsgIdIsIdempotent() {
    Session s = sessionService.getOrCreateCurrent(1L, 100L, "web_h5", null);
    Message m1 =
        messageService.append(s.getId(), "c-1", "user", "text", Map.of("text", "hi"), null);
    Message m2 =
        messageService.append(s.getId(), "c-1", "user", "text", Map.of("text", "hi"), null);
    assertThat(m2.getId()).isEqualTo(m1.getId());
    assertThat(m2.getSeq()).isEqualTo(m1.getSeq());
  }

  @Test
  void historyDescBySeq() {
    Session s = sessionService.getOrCreateCurrent(1L, 100L, "web_h5", null);
    for (int i = 0; i < 5; i++) {
      messageService.append(s.getId(), "c-" + i, "user", "text", Map.of("text", "" + i), null);
    }
    List<Message> page = messageService.history(s.getId(), 0, 3);
    assertThat(page).hasSize(3);
    assertThat(page.get(0).getSeq()).isGreaterThan(page.get(1).getSeq());
    // 翻页:before = 最后一条的 seq
    long before = page.get(page.size() - 1).getSeq();
    List<Message> next = messageService.history(s.getId(), before, 3);
    assertThat(next).hasSize(2);
  }
}
