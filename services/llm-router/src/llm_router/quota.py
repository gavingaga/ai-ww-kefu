"""按 profile 滑动窗口限速 + 日预算 — 内存版,M3 起步;后续接 Redis。

- RPM:60 秒内请求数上限
- TPM:60 秒内 token 数上限(只算 in+out 估算,精确值见 OpenAI usage)
- 日预算:USD,按 profile.{rate_in_per_1k, rate_out_per_1k} 估算;超额 503

所有方法线程安全(asyncio.Lock 保护)。
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from .profiles import ProfileRegistry


@dataclass
class _Window:
    """简单环形:(ts, value) 列表,过期则丢弃。"""

    items: list[tuple[float, int]] = field(default_factory=list)

    def add(self, ts: float, value: int) -> None:
        self.items.append((ts, value))

    def trim(self, cutoff: float) -> None:
        i = 0
        for i, (t, _v) in enumerate(self.items):
            if t >= cutoff:
                break
        else:
            self.items = []
            return
        self.items = self.items[i:]

    def sum(self) -> int:
        return sum(v for _t, v in self.items)


@dataclass
class _DailyState:
    day: str = ""
    cost_usd: float = 0.0


class QuotaManager:
    """按 profile 计量并裁定是否放行。

    用法:
        ok, reason, used_pct = await qm.check_and_reserve(profile_id, est_in_tokens=100)
        if not ok: raise HTTPException(...)
        # 调用 LLM
        await qm.record(profile_id, in_tokens, out_tokens)
    """

    def __init__(self, reg: ProfileRegistry):
        self._reg = reg
        self._lock = asyncio.Lock()
        self._req_window: dict[str, _Window] = {}
        self._tok_window: dict[str, _Window] = {}
        self._daily: dict[str, _DailyState] = {}

    async def check_and_reserve(
        self, profile_id: str, est_in_tokens: int
    ) -> tuple[bool, str, float]:
        """返回 (ok, reason_if_block, budget_used_pct)。
        ok=True 时已把预估 in_tokens 计入窗口;后续 record() 用 (out_tokens-est=delta) 修正。
        """
        p = self._reg.get(profile_id)
        if p is None:
            return False, "profile not found", 0.0
        rpm = int(getattr(p, "rpm", 0) or 0)
        tpm = int(getattr(p, "tpm", 0) or 0)
        budget = float(getattr(p, "budget_usd_daily", 0) or 0)
        async with self._lock:
            now = time.time()
            cutoff = now - 60
            req = self._req_window.setdefault(profile_id, _Window())
            tok = self._tok_window.setdefault(profile_id, _Window())
            req.trim(cutoff)
            tok.trim(cutoff)
            if rpm > 0 and req.sum() + 1 > rpm:
                return False, f"rpm exceeded ({req.sum()}/{rpm})", self._used_pct(profile_id, budget)
            if tpm > 0 and tok.sum() + est_in_tokens > tpm:
                return False, f"tpm exceeded ({tok.sum() + est_in_tokens}/{tpm})", self._used_pct(profile_id, budget)
            used_pct = self._used_pct(profile_id, budget)
            if budget > 0 and used_pct >= 1.0:
                return False, f"daily budget exhausted {used_pct * 100:.1f}%", used_pct
            req.add(now, 1)
            tok.add(now, est_in_tokens)
            return True, "", used_pct

    async def record(
        self,
        profile_id: str,
        in_tokens: int,
        out_tokens: int,
        est_in_tokens_already_reserved: int = 0,
    ) -> float:
        """记录真实用量;返回新的 budget_used_pct。"""
        p = self._reg.get(profile_id)
        rate_in = float(getattr(p, "rate_in_per_1k", 0) or 0) if p else 0.0
        rate_out = float(getattr(p, "rate_out_per_1k", 0) or 0) if p else 0.0
        cost = (in_tokens / 1000) * rate_in + (out_tokens / 1000) * rate_out
        async with self._lock:
            now = time.time()
            tok = self._tok_window.setdefault(profile_id, _Window())
            # 把 in_tokens 修正到真实值(扣除 reserved 估算)
            delta_in = in_tokens - est_in_tokens_already_reserved
            if delta_in:
                tok.add(now, delta_in)
            tok.add(now, out_tokens)
            today = time.strftime("%Y-%m-%d", time.gmtime(now))
            d = self._daily.setdefault(profile_id, _DailyState())
            if d.day != today:
                d.day = today
                d.cost_usd = 0.0
            d.cost_usd += cost
            budget = float(getattr(p, "budget_usd_daily", 0) or 0) if p else 0.0
            return self._used_pct(profile_id, budget)

    def snapshot(self, profile_id: str) -> dict[str, float | int | str]:
        req = self._req_window.get(profile_id, _Window())
        tok = self._tok_window.get(profile_id, _Window())
        cutoff = time.time() - 60
        req.trim(cutoff)
        tok.trim(cutoff)
        d = self._daily.get(profile_id, _DailyState())
        p = self._reg.get(profile_id)
        budget = float(getattr(p, "budget_usd_daily", 0) or 0) if p else 0.0
        return {
            "profile_id": profile_id,
            "rpm_used": req.sum(),
            "tpm_used": tok.sum(),
            "rpm_limit": int(getattr(p, "rpm", 0) or 0) if p else 0,
            "tpm_limit": int(getattr(p, "tpm", 0) or 0) if p else 0,
            "budget_usd_daily": budget,
            "today_cost_usd": round(d.cost_usd, 4),
            "today_used_pct": round(self._used_pct(profile_id, budget), 4),
            "day": d.day,
        }

    def _used_pct(self, profile_id: str, budget: float) -> float:
        if budget <= 0:
            return 0.0
        d = self._daily.get(profile_id)
        if d is None:
            return 0.0
        return d.cost_usd / budget
