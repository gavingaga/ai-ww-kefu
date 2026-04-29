package com.aikefu.agentbff.lock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;

import com.aikefu.agentbff.push.AgentEventBus;

class DeviceLockStoreTest {

  @Test
  void firstHeartbeatTakesLock() {
    AgentEventBus bus = mock(AgentEventBus.class);
    var s = new DeviceLockStore(bus, 15);
    var r = s.heartbeat(1L, "dev-A");
    assertThat(r.get("ok")).isEqualTo(true);
    assertThat(r.get("holder")).isEqualTo("dev-A");
    assertThat(r.get("evicted")).isEqualTo("");
    assertThat(s.isHolder(1L, "dev-A")).isTrue();
    verify(bus, never()).publish(anyLong(), eq("device-evicted"), any());
  }

  @Test
  void sameDeviceHeartbeatNotEvicted() {
    AgentEventBus bus = mock(AgentEventBus.class);
    var s = new DeviceLockStore(bus, 15);
    s.heartbeat(1L, "dev-A");
    var r = s.heartbeat(1L, "dev-A");
    assertThat(r.get("evicted")).isEqualTo("");
    verify(bus, never()).publish(anyLong(), eq("device-evicted"), any());
  }

  @Test
  void differentDevicePreemptsAndEvicts() {
    AgentEventBus bus = mock(AgentEventBus.class);
    var s = new DeviceLockStore(bus, 15);
    s.heartbeat(7L, "dev-A");
    var r = s.heartbeat(7L, "dev-B");
    assertThat(r.get("evicted")).isEqualTo("dev-A");
    assertThat(s.isHolder(7L, "dev-B")).isTrue();
    assertThat(s.isHolder(7L, "dev-A")).isFalse();
    verify(bus).publish(eq(7L), eq("device-evicted"), any());
  }

  @Test
  void releaseClearsHolder() {
    var s = new DeviceLockStore(mock(AgentEventBus.class), 15);
    s.heartbeat(1L, "dev-A");
    s.release(1L, "dev-A");
    assertThat(s.isHolder(1L, "dev-A")).isFalse();
  }

  @Test
  void releaseFromOtherDeviceIsNoop() {
    var s = new DeviceLockStore(mock(AgentEventBus.class), 15);
    s.heartbeat(1L, "dev-A");
    s.release(1L, "dev-B");
    assertThat(s.isHolder(1L, "dev-A")).isTrue();
  }

  @Test
  void snapshotReportsHolder() {
    var s = new DeviceLockStore(mock(AgentEventBus.class), 15);
    s.heartbeat(1L, "dev-X");
    var snap = s.snapshot(1L);
    assertThat(snap.get("holder")).isEqualTo("dev-X");
  }
}
