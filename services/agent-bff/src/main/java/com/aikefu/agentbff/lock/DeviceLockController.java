package com.aikefu.agentbff.lock;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/agent/device")
public class DeviceLockController {

  private final DeviceLockStore store;

  public DeviceLockController(DeviceLockStore store) {
    this.store = store;
  }

  /**
   * 心跳 / 抢占 — web-agent 启动 + 每 5s 调一次。
   * 老设备会收到 SSE device-evicted。
   */
  @PostMapping("/heartbeat")
  public Map<String, Object> heartbeat(
      @RequestHeader("X-Agent-Id") long agentId,
      @RequestHeader("X-Device-Id") String deviceId) {
    return store.heartbeat(agentId, deviceId);
  }

  @GetMapping("/holder")
  public Map<String, Object> holder(@RequestHeader("X-Agent-Id") long agentId) {
    return store.snapshot(agentId);
  }

  @PostMapping("/release")
  public Map<String, Object> release(
      @RequestHeader("X-Agent-Id") long agentId,
      @RequestHeader("X-Device-Id") String deviceId) {
    store.release(agentId, deviceId);
    return Map.of("ok", true);
  }
}
