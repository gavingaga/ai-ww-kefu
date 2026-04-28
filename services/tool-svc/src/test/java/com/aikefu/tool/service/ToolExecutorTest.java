package com.aikefu.tool.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.aikefu.tool.clients.AuditEmitter;
import com.aikefu.tool.registry.Tool;
import com.aikefu.tool.registry.ToolContext;
import com.aikefu.tool.registry.ToolRegistry;

class ToolExecutorTest {

  private ToolExecutor newExec(ToolRegistry reg) {
    return new ToolExecutor(reg, mock(AuditEmitter.class), 500);
  }

  @Test
  void readToolReturnsResultAndAuditFires() {
    ToolRegistry reg = new ToolRegistry();
    reg.register(
        Tool.builder()
            .name("ping")
            .description("d")
            .parameters(Map.of("type", "object"))
            .handler((args, ctx) -> Map.of("pong", args.getOrDefault("x", 0)))
            .build());
    AuditEmitter audit = mock(AuditEmitter.class);
    ToolExecutor exec = new ToolExecutor(reg, audit, 500);
    Map<String, Object> resp =
        exec.invoke(
            "ping",
            Map.of("x", 7),
            ToolContext.builder().sessionId("s").uid(1L).dryRun(false).build());
    assertThat(resp.get("ok")).isEqualTo(true);
    assertThat(((Map<?, ?>) resp.get("result")).get("pong")).isEqualTo(7);
    verify(audit).emit(any());
  }

  @Test
  void writeToolDryRunByDefaultDoesNotInvokeHandler() {
    boolean[] hit = {false};
    ToolRegistry reg = new ToolRegistry();
    reg.register(
        Tool.builder()
            .name("danger")
            .description("d")
            .parameters(Map.of("type", "object"))
            .write(true)
            .handler(
                (a, c) -> {
                  hit[0] = true;
                  return Map.of("did", "actually-execute");
                })
            .build());
    ToolExecutor exec = newExec(reg);
    Map<String, Object> resp =
        exec.invoke("danger", Map.of("k", 1), ToolContext.builder().dryRun(true).build());
    assertThat(resp.get("ok")).isEqualTo(true);
    assertThat(((Map<?, ?>) resp.get("result")).get("dry_run")).isEqualTo(true);
    assertThat(hit[0]).isFalse();
  }

  @Test
  void writeToolWithDryRunFalseExecutes() {
    ToolRegistry reg = new ToolRegistry();
    reg.register(
        Tool.builder()
            .name("commit")
            .description("d")
            .parameters(Map.of("type", "object"))
            .write(true)
            .handler((a, c) -> Map.of("did", "real"))
            .build());
    ToolExecutor exec = newExec(reg);
    Map<String, Object> resp =
        exec.invoke("commit", Map.of(), ToolContext.builder().dryRun(false).build());
    assertThat(((Map<?, ?>) resp.get("result")).get("did")).isEqualTo("real");
  }

  @Test
  void unknownToolReturnsNotRegistered() {
    ToolExecutor exec = newExec(new ToolRegistry());
    Map<String, Object> resp = exec.invoke("nope", Map.of(), ToolContext.builder().build());
    assertThat(resp.get("ok")).isEqualTo(false);
    assertThat(String.valueOf(resp.get("error"))).contains("not registered");
  }

  @Test
  void timeoutCancelsAndReportsError() {
    ToolRegistry reg = new ToolRegistry();
    reg.register(
        Tool.builder()
            .name("slow")
            .description("d")
            .parameters(Map.of("type", "object"))
            .timeoutMs(50)
            .handler(
                (a, c) -> {
                  try {
                    Thread.sleep(500);
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                  }
                  return Map.of("ok", true);
                })
            .build());
    ToolExecutor exec = newExec(reg);
    Map<String, Object> resp =
        exec.invoke("slow", Map.of(), ToolContext.builder().dryRun(false).build());
    assertThat(resp.get("ok")).isEqualTo(false);
    assertThat(String.valueOf(resp.get("error"))).contains("timeout");
  }

  @Test
  void handlerExceptionIsCaughtAsExecutionError() {
    ToolRegistry reg = new ToolRegistry();
    reg.register(
        Tool.builder()
            .name("boom")
            .description("d")
            .parameters(Map.of("type", "object"))
            .handler(
                (a, c) -> {
                  throw new RuntimeException("kaboom");
                })
            .build());
    ToolExecutor exec = newExec(reg);
    Map<String, Object> resp = exec.invoke("boom", Map.of(), ToolContext.builder().build());
    assertThat(resp.get("ok")).isEqualTo(false);
    assertThat(String.valueOf(resp.get("error"))).contains("kaboom");
  }
}
