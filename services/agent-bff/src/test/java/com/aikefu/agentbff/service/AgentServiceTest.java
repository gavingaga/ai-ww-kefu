package com.aikefu.agentbff.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.aikefu.agentbff.clients.RoutingClient;
import com.aikefu.agentbff.clients.SessionClient;

class AgentServiceTest {

  @Test
  void inboxAggregatesQueueAcrossAgentSkillGroups() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    var svc = new AgentService(routing, session);

    when(routing.getAgent(1L))
        .thenReturn(
            Map.of(
                "id", 1,
                "skillGroups", List.of("play_tech", "general"),
                "activeSessionIds", List.of("ses_a", "ses_b")));
    when(routing.listQueue("play_tech"))
        .thenReturn(
            List.<Map<String, Object>>of(
                Map.of("id", "q1", "session_id", "s1"),
                Map.of("id", "q2", "session_id", "s2")));
    when(routing.listQueue("general")).thenReturn(List.of());
    when(session.session("ses_a")).thenReturn(Map.of("id", "ses_a", "status", "in_agent"));
    when(session.session("ses_b")).thenReturn(Map.of("id", "ses_b", "status", "in_agent"));

    Map<String, Object> inbox = svc.inbox(1L);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> waiting = (List<Map<String, Object>>) inbox.get("waiting");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> active = (List<Map<String, Object>>) inbox.get("active");
    assertThat(waiting).hasSize(2);
    assertThat(active).hasSize(2);
  }

  @Test
  void acceptDelegatesToRoutingAssign() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    var svc = new AgentService(routing, session);
    when(routing.assign(1L, "q1")).thenReturn(Map.of("entryId", "q1", "agentId", 1L));
    var res = svc.accept(1L, "q1");
    assertThat(res).containsEntry("entryId", "q1");
  }

  @Test
  void closeReleasesAndClosesEvenWhenSessionAlready404() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    doThrow(new RuntimeException("404")).when(session).close(anyString());
    var svc = new AgentService(routing, session);
    var res = svc.close(1L, "ses_x");
    assertThat(res).containsEntry("ok", true);
    verify(routing).release(1L, "ses_x");
  }

  @Test
  void inboxIgnoresPerGroupQueueErrors() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    when(routing.getAgent(1L))
        .thenReturn(Map.of("skillGroups", List.of("a", "b"), "activeSessionIds", List.of()));
    when(routing.listQueue("a")).thenThrow(new RuntimeException("boom"));
    when(routing.listQueue("b")).thenReturn(List.of(Map.of("id", "q9")));
    var svc = new AgentService(routing, session);
    Map<String, Object> inbox = svc.inbox(1L);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> waiting = (List<Map<String, Object>>) inbox.get("waiting");
    assertThat(waiting).hasSize(1);
  }

  @Test
  void setStatusPassesThrough() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    when(routing.setStatus(anyLong(), anyString())).thenReturn(Map.of("status", "IDLE"));
    var svc = new AgentService(routing, session);
    var res = svc.setStatus(1L, "IDLE");
    assertThat(res).containsEntry("status", "IDLE");
  }

  @Test
  void whisperWritesSystemMessageAsSupervisor() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    when(session.append(anyString(), anyString(), org.mockito.ArgumentMatchers.anyMap()))
        .thenReturn(Map.of("id", "msg_x"));
    var svc = new AgentService(routing, session);
    var res = svc.whisper(99L, "ses_a", "请把语速放慢点");
    assertThat(res).containsEntry("id", "msg_x");
    @SuppressWarnings("rawtypes")
    org.mockito.ArgumentCaptor<Map> cap = org.mockito.ArgumentCaptor.forClass(Map.class);
    org.mockito.Mockito.verify(session).append(anyString(), anyString(), cap.capture());
    @SuppressWarnings("unchecked")
    Map<String, Object> sent = cap.getValue();
    assertThat(sent).containsEntry("role", "system");
    assertThat(sent).containsEntry("type", "system");
    @SuppressWarnings("unchecked")
    Map<String, Object> content = (Map<String, Object>) sent.get("content");
    assertThat(content).containsEntry("sub", "supervisor");
    assertThat(content).containsEntry("text", "请把语速放慢点");
  }

  @Test
  void stealDelegatesToRoutingTransfer() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    when(routing.transfer(1L, 99L, "ses_a")).thenReturn(Map.of("ok", true));
    var svc = new AgentService(routing, session);
    var res = svc.steal(99L, 1L, "ses_a");
    assertThat(res).containsEntry("ok", true);
  }

  @Test
  void acceptPublishesInboxChangedEvent() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    var bus = mock(com.aikefu.agentbff.push.AgentEventBus.class);
    when(routing.assign(1L, "q1")).thenReturn(Map.of("entryId", "q1"));
    var svc = new AgentService(routing, session, bus);
    svc.accept(1L, "q1");
    org.mockito.Mockito.verify(bus)
        .publish(org.mockito.ArgumentMatchers.eq(1L),
            org.mockito.ArgumentMatchers.eq("inbox-changed"),
            org.mockito.ArgumentMatchers.any());
  }

  @Test
  void sendMessagePushesFrameToGatewayAsAgent() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    var bus = mock(com.aikefu.agentbff.push.AgentEventBus.class);
    var gateway = mock(com.aikefu.agentbff.clients.GatewayClient.class);
    when(session.append(anyString(), anyString(), org.mockito.ArgumentMatchers.anyMap()))
        .thenReturn(
            Map.of(
                "id", "msg_42",
                "type", "text",
                "role", "agent",
                "content", Map.of("text", "您好"),
                "clientMsgId", "agent-1"));
    var svc = new AgentService(routing, session, bus, gateway);
    svc.sendMessage("ses_a", "agent-1", Map.of("type", "text", "content", Map.of("text", "您好")));

    @SuppressWarnings("rawtypes")
    org.mockito.ArgumentCaptor<Map> cap = org.mockito.ArgumentCaptor.forClass(Map.class);
    org.mockito.Mockito.verify(gateway)
        .push(org.mockito.ArgumentMatchers.eq("ses_a"), cap.capture());
    @SuppressWarnings("unchecked")
    Map<String, Object> frame = cap.getValue();
    assertThat(frame).containsEntry("type", "msg.text");
    assertThat(frame).containsEntry("msg_id", "msg_42");
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) frame.get("payload");
    assertThat(payload).containsEntry("role", "agent");
    assertThat(payload).containsEntry("text", "您好");
    assertThat(payload).containsEntry("client_msg_id", "agent-1");
  }

  @Test
  void sendMessageWithSenderPublishesSessionMessageToSenderAndObservers() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    var bus = mock(com.aikefu.agentbff.push.AgentEventBus.class);
    var gateway = mock(com.aikefu.agentbff.clients.GatewayClient.class);
    when(session.append(anyString(), anyString(), org.mockito.ArgumentMatchers.anyMap()))
        .thenReturn(Map.of("id", "msg_1", "type", "text", "role", "agent"));
    when(routing.observersOf("ses_a")).thenReturn(List.of(99L, 88L));

    var svc = new AgentService(routing, session, bus, gateway);
    svc.sendMessage("ses_a", "k", Map.of("type", "text"), 1L);

    org.mockito.Mockito.verify(bus)
        .publish(
            org.mockito.ArgumentMatchers.eq(1L),
            org.mockito.ArgumentMatchers.eq("session-message"),
            org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.verify(bus)
        .publish(
            org.mockito.ArgumentMatchers.eq(99L),
            org.mockito.ArgumentMatchers.eq("session-message"),
            org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.verify(bus)
        .publish(
            org.mockito.ArgumentMatchers.eq(88L),
            org.mockito.ArgumentMatchers.eq("session-message"),
            org.mockito.ArgumentMatchers.any());
  }

  @Test
  void whisperPushesAsSystem() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    var bus = mock(com.aikefu.agentbff.push.AgentEventBus.class);
    var gateway = mock(com.aikefu.agentbff.clients.GatewayClient.class);
    when(session.append(anyString(), anyString(), org.mockito.ArgumentMatchers.anyMap()))
        .thenReturn(
            Map.of(
                "id", "msg_w",
                "type", "system",
                "role", "system",
                "content", Map.of("text", "请加急", "sub", "supervisor")));
    var svc = new AgentService(routing, session, bus, gateway);
    svc.whisper(99L, "ses_a", "请加急");
    @SuppressWarnings("rawtypes")
    org.mockito.ArgumentCaptor<Map> cap = org.mockito.ArgumentCaptor.forClass(Map.class);
    org.mockito.Mockito.verify(gateway)
        .push(org.mockito.ArgumentMatchers.eq("ses_a"), cap.capture());
    @SuppressWarnings("unchecked")
    Map<String, Object> frame = cap.getValue();
    assertThat(frame).containsEntry("type", "msg.system");
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) frame.get("payload");
    assertThat(payload).containsEntry("sub", "supervisor");
    assertThat(payload).containsEntry("role", "system");
  }

  @Test
  void transferPublishesToBothAgents() {
    var routing = mock(RoutingClient.class);
    var session = mock(SessionClient.class);
    var bus = mock(com.aikefu.agentbff.push.AgentEventBus.class);
    when(routing.transfer(1L, 99L, "ses_a")).thenReturn(Map.of("ok", true));
    var svc = new AgentService(routing, session, bus);
    svc.transfer(1L, 99L, "ses_a");
    org.mockito.Mockito.verify(bus).publish(org.mockito.ArgumentMatchers.eq(1L),
        org.mockito.ArgumentMatchers.eq("inbox-changed"),
        org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.verify(bus).publish(org.mockito.ArgumentMatchers.eq(99L),
        org.mockito.ArgumentMatchers.eq("inbox-changed"),
        org.mockito.ArgumentMatchers.any());
  }
}
