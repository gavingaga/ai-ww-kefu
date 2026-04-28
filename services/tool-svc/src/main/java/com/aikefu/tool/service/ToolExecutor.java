package com.aikefu.tool.service;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.aikefu.tool.clients.AuditEmitter;
import com.aikefu.tool.registry.Tool;
import com.aikefu.tool.registry.ToolContext;
import com.aikefu.tool.registry.ToolRegistry;

/** 工具执行入口 — 兜底超时、空注册降级、审计落库。 */
@Service
public class ToolExecutor {

  private static final Logger LOG = LoggerFactory.getLogger(ToolExecutor.class);

  private final ToolRegistry registry;
  private final AuditEmitter audit;
  private final long defaultTimeoutMs;
  private final ExecutorService pool =
      Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "tool-exec");
        t.setDaemon(true);
        return t;
      });

  public ToolExecutor(
      ToolRegistry registry,
      AuditEmitter audit,
      @Value("${aikefu.tool.default-timeout-ms:3000}") long defaultTimeoutMs) {
    this.registry = registry;
    this.audit = audit;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /** 执行;无论成功失败,都返回统一结构 {ok, result?, error?, duration_ms, audit_id}。 */
  public Map<String, Object> invoke(String name, Map<String, Object> args, ToolContext ctx) {
    String auditId = "tex_" + UUID.randomUUID().toString().replace("-", "");
    long started = System.nanoTime();
    Tool tool = registry.get(name);
    Map<String, Object> safeArgs = args == null ? Map.of() : args;
    if (tool == null) {
      Map<String, Object> resp = response(false, null, "tool not registered", started, auditId);
      emitAudit(auditId, name, safeArgs, ctx, resp, "tool not registered");
      return resp;
    }
    if (tool.isWrite() && (ctx == null || ctx.isDryRun())) {
      Map<String, Object> sim =
          Map.of(
              "ok", true,
              "dry_run", true,
              "would_call", Map.of("name", name, "args", safeArgs),
              "message", "dry_run:实际未执行,等待用户/坐席二次确认。");
      Map<String, Object> resp = wrap(true, sim, null, started, auditId);
      emitAudit(auditId, name, safeArgs, ctx, resp, "dry_run");
      return resp;
    }
    long timeoutMs = tool.getTimeoutMs() > 0 ? tool.getTimeoutMs() : defaultTimeoutMs;
    Callable<Map<String, Object>> task = () -> tool.getHandler().apply(safeArgs, ctx);
    Future<Map<String, Object>> future = pool.submit(task);
    try {
      Map<String, Object> result = future.get(timeoutMs, TimeUnit.MILLISECONDS);
      Map<String, Object> resp = response(true, result, null, started, auditId);
      emitAudit(auditId, name, safeArgs, ctx, resp, "ok");
      return resp;
    } catch (TimeoutException e) {
      future.cancel(true);
      Map<String, Object> resp =
          response(false, null, "timeout after " + timeoutMs + "ms", started, auditId);
      emitAudit(auditId, name, safeArgs, ctx, resp, "timeout");
      return resp;
    } catch (ExecutionException e) {
      Throwable cause = e.getCause() == null ? e : e.getCause();
      LOG.warn("tool {} failed: {}", name, cause.toString());
      Map<String, Object> resp =
          response(false, null, "execution failed: " + cause.getMessage(), started, auditId);
      emitAudit(auditId, name, safeArgs, ctx, resp, "error");
      return resp;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return response(false, null, "interrupted", started, auditId);
    }
  }

  private static Map<String, Object> response(
      boolean ok, Map<String, Object> result, String error, long startedNano, String auditId) {
    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("ok", ok);
    if (result != null) resp.put("result", result);
    if (error != null) resp.put("error", error);
    resp.put("duration_ms", (System.nanoTime() - startedNano) / 1_000_000);
    resp.put("audit_id", auditId);
    return resp;
  }

  private static Map<String, Object> wrap(
      boolean ok, Map<String, Object> result, String error, long startedNano, String auditId) {
    return response(ok, result, error, startedNano, auditId);
  }

  private void emitAudit(
      String auditId,
      String name,
      Map<String, Object> args,
      ToolContext ctx,
      Map<String, Object> resp,
      String outcome) {
    Map<String, Object> ev = new LinkedHashMap<>();
    ev.put("id", auditId);
    ev.put("kind", "tool.invoke");
    if (ctx != null) {
      Map<String, Object> actor = new LinkedHashMap<>();
      if (ctx.getUid() != null) actor.put("id", ctx.getUid());
      actor.put("role", "SYSTEM");
      ev.put("actor", actor);
      if (ctx.getSessionId() != null) ev.put("sessionId", ctx.getSessionId());
    }
    ev.put("target", name);
    ev.put("action", outcome);
    Map<String, Object> meta = new LinkedHashMap<>();
    meta.put("args", args);
    meta.put("dry_run", ctx != null && ctx.isDryRun());
    Object dur = resp.get("duration_ms");
    if (dur != null) meta.put("duration_ms", dur);
    if (resp.get("error") != null) meta.put("error", resp.get("error"));
    if (Duration.ofMillis(0).isZero()) meta.put("ts_ms", System.currentTimeMillis());
    ev.put("meta", meta);
    audit.emit(ev);
  }
}
