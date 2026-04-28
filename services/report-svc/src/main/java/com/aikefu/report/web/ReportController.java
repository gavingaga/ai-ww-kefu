package com.aikefu.report.web;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.report.service.ReportService;
import com.aikefu.report.store.EventStore;

@RestController
@RequestMapping("/v1")
public class ReportController {

  private final EventStore store;
  private final ReportService report;
  private final int defaultWindowMin;

  public ReportController(
      EventStore store,
      ReportService report,
      @Value("${aikefu.report.default-window-min:60}") int defaultWindowMin) {
    this.store = store;
    this.report = report;
    this.defaultWindowMin = defaultWindowMin;
  }

  @GetMapping("/healthz")
  public Map<String, Object> healthz() {
    return Map.of("status", "ok", "size", store.size(), "capacity", store.capacity());
  }

  @PostMapping("/events")
  public Map<String, Object> append(@RequestBody Map<String, Object> body) {
    return store.append(body);
  }

  @GetMapping("/report/{kind}")
  public ResponseEntity<Map<String, Object>> report(
      @PathVariable("kind") String kind,
      @RequestParam(value = "window_min", required = false) Integer windowMin,
      @RequestParam(value = "bucket_sec", defaultValue = "300") int bucketSec) {
    int w = windowMin == null ? defaultWindowMin : Math.max(1, Math.min(windowMin, 24 * 60));
    return switch (kind) {
      case "kpi" -> ResponseEntity.ok(report.kpi(w));
      case "csat" -> ResponseEntity.ok(report.csat(w));
      case "tools" -> ResponseEntity.ok(report.tools(w));
      case "agents" -> ResponseEntity.ok(report.agents(w));
      case "handoff" -> ResponseEntity.ok(report.handoff(w));
      case "timeseries" -> ResponseEntity.ok(report.timeseries(w, bucketSec));
      default -> ResponseEntity.badRequest().body(Map.of("error", "unknown kind: " + kind));
    };
  }
}
