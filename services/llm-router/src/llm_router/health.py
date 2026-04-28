"""档位健康分跟踪(滑动窗口成功率 + P95 延迟)。

每次完成一次 Chat 调用后调 :meth:`record`;:meth:`snapshot` 给 admin 观察。
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class _Stat:
    timestamps: deque[float] = field(default_factory=lambda: deque(maxlen=512))
    latencies_ms: deque[float] = field(default_factory=lambda: deque(maxlen=512))
    successes: deque[bool] = field(default_factory=lambda: deque(maxlen=512))
    last_error: str = ""
    last_check_at: float = 0.0


class HealthTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._by_id: dict[str, _Stat] = {}

    def record(
        self, profile_id: str, latency_ms: float, success: bool, err: str = ""
    ) -> None:
        with self._lock:
            stat = self._by_id.setdefault(profile_id, _Stat())
            stat.timestamps.append(time.time())
            stat.latencies_ms.append(latency_ms)
            stat.successes.append(success)
            stat.last_check_at = time.time()
            if not success:
                stat.last_error = err

    def snapshot(self, profile_id: str) -> dict[str, object]:
        with self._lock:
            stat = self._by_id.get(profile_id)
            if not stat or not stat.successes:
                return {"profile_id": profile_id, "samples": 0}
            n = len(stat.successes)
            ok = sum(1 for s in stat.successes if s)
            sorted_lat = sorted(stat.latencies_ms)
            p95 = sorted_lat[int(0.95 * (n - 1))] if n else 0.0
            return {
                "profile_id": profile_id,
                "samples": n,
                "success_rate": round(ok / n, 4),
                "p95_ms": round(p95, 2),
                "last_error": stat.last_error,
                "last_check_at": stat.last_check_at,
            }

    def all(self) -> list[dict[str, object]]:
        with self._lock:
            return [self.snapshot(pid) for pid in self._by_id]
