"""QuotaManager 单测 — 滑窗 RPM/TPM + 日预算。"""

from __future__ import annotations

import asyncio

import pytest

from llm_router.profiles import ModelProfile, ProfileRegistry
from llm_router.quota import QuotaManager


def reg_with(rpm: int = 0, tpm: int = 0, budget: float = 0.0, rate_in: float = 0.0, rate_out: float = 0.0):
    p = ModelProfile(
        id="t",
        rpm=rpm,
        tpm=tpm,
        budget_usd_daily=budget,
        rate_in_per_1k=rate_in,
        rate_out_per_1k=rate_out,
    )
    return ProfileRegistry([p])


def test_rpm_blocks_after_threshold():
    qm = QuotaManager(reg_with(rpm=2, tpm=0))
    a, _, _ = asyncio.run(qm.check_and_reserve("t", 10))
    b, _, _ = asyncio.run(qm.check_and_reserve("t", 10))
    c, reason, _ = asyncio.run(qm.check_and_reserve("t", 10))
    assert a and b
    assert not c
    assert "rpm" in reason


def test_tpm_blocks_when_input_too_big():
    qm = QuotaManager(reg_with(rpm=100, tpm=100))
    a, _, _ = asyncio.run(qm.check_and_reserve("t", 60))
    b, reason, _ = asyncio.run(qm.check_and_reserve("t", 60))
    assert a
    assert not b
    assert "tpm" in reason


def test_budget_blocks_after_record():
    qm = QuotaManager(reg_with(rpm=100, tpm=10_000, budget=0.01, rate_in=10.0, rate_out=10.0))
    asyncio.run(qm.check_and_reserve("t", 1))
    pct = asyncio.run(qm.record("t", in_tokens=1000, out_tokens=0))  # 1000/1000 * 10 = 10 USD
    assert pct >= 1.0
    ok, reason, used_pct = asyncio.run(qm.check_and_reserve("t", 1))
    assert not ok
    assert "budget" in reason
    assert used_pct >= 1.0


def test_snapshot_includes_used_pct():
    qm = QuotaManager(reg_with(rpm=10, tpm=1000, budget=10.0, rate_in=1.0, rate_out=2.0))
    asyncio.run(qm.check_and_reserve("t", 100))
    asyncio.run(qm.record("t", 100, 200))
    snap = qm.snapshot("t")
    assert snap["rpm_limit"] == 10
    assert snap["tpm_limit"] == 1000
    assert snap["budget_usd_daily"] == 10.0
    assert snap["today_used_pct"] >= 0.0


@pytest.mark.parametrize("rpm,tpm", [(0, 0), (0, 100), (100, 0)])
def test_unlimited_dimensions_pass(rpm: int, tpm: int):
    qm = QuotaManager(reg_with(rpm=rpm, tpm=tpm))
    for _ in range(20):
        ok, _, _ = asyncio.run(qm.check_and_reserve("t", 5))
        assert ok
