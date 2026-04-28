"""HandoffPacket 单测。"""

from __future__ import annotations

from typing import Any

import pytest

from ai_hub.handoff import (
    HandoffPacket,
    build_handoff_packet,
    extract_entities,
    suggest_skill_group,
    take_recent_history,
)


def test_extract_entities_picks_order_and_room():
    e = extract_entities(
        "我订单 #ABC1234 一直没发货,直播间也卡顿",
        {"room_id": 8001, "anchor_id": 1234, "scene": "live_room"},
    )
    assert e["room_id"] == 8001
    assert e["anchor_id"] == 1234
    assert e["order_id"] == "ABC1234"


def test_extract_entities_picks_amount_when_refund():
    e = extract_entities("我要退款 5000 元", {})
    assert e.get("amount_hint") == "5000"


def test_take_recent_history_includes_current_user():
    history = [
        {"role": "user", "content": "你好"},
        {"role": "tool", "content": "tool-data"},
        {"role": "assistant", "content": "在的"},
        {"role": "user", "content": " "},
    ]
    out = take_recent_history(history, "现在卡顿", max_turns=4)
    roles = [m["role"] for m in out]
    # tool 角色保留;空内容过滤
    assert roles[-1] == "user"
    assert out[-1]["content"] == "现在卡顿"
    assert "tool" in roles
    assert all(m["content"].strip() for m in out)


def test_suggest_skill_group_minor_outranks_scene():
    assert suggest_skill_group("minor_compliance", {"scene": "live_room"}) == "minor_compliance"
    assert suggest_skill_group("report_compliance", {"scene": "anchor_console"}) == "content_copyright"
    assert suggest_skill_group("rag_low_confidence", {"scene": "live_room"}) == "play_tech"
    assert suggest_skill_group("rule_keyword", {"scene": "live_room"}) == "general"


@pytest.mark.asyncio
async def test_build_packet_with_local_fallback_when_no_llm():
    pkt = await build_handoff_packet(
        session_id="ses_1",
        reason="rule_keyword",
        user_text="我要投诉",
        history=[{"role": "user", "content": "卡顿好久了"}],
        profile={"uid": 100, "level": "VIP3"},
        live_context={"scene": "live_room", "room_id": 8001},
        llm_call=None,
    )
    assert isinstance(pkt, HandoffPacket)
    assert pkt.session_id == "ses_1"
    assert pkt.reason == "rule_keyword"
    assert pkt.user["level"] == "VIP3"
    assert pkt.user["id"] == 100
    assert "live_room" in pkt.summary
    assert pkt.suggested_replies  # 模板兜底应非空
    assert pkt.entities["room_id"] == 8001
    assert pkt.skill_group_hint == "general"


@pytest.mark.asyncio
async def test_build_packet_uses_llm_when_provided():
    calls: list[list[dict[str, Any]]] = []

    async def stub_llm(messages: list[dict[str, Any]]) -> str:
        calls.append(messages)
        last_user = next((m for m in reversed(messages) if m["role"] == "user"), None)
        # 第一次为 summary,第二次为 suggest:按 prompt 内容区分
        first_sys = (messages[0]["content"] if messages else "").strip()
        if "摘要" in first_sys:
            return "用户在直播间报卡顿,要求加急处理。"
        return '["稍候核实","已为你转技术"]'

    pkt = await build_handoff_packet(
        session_id="ses_2",
        reason="rag_low_confidence",
        user_text="卡了 5 分钟",
        history=[{"role": "user", "content": "卡了 5 分钟"}],
        profile={"uid": 8},
        live_context={"scene": "live_room", "room_id": 9},
        llm_call=stub_llm,
    )
    assert pkt.summary == "用户在直播间报卡顿,要求加急处理。"
    assert pkt.suggested_replies == ["稍候核实", "已为你转技术"]
    assert pkt.skill_group_hint == "play_tech"
    assert len(calls) == 2  # 摘要 + 建议各一次


@pytest.mark.asyncio
async def test_build_packet_llm_failure_falls_back_to_local():
    async def boom(_msgs):  # noqa: ANN001
        raise RuntimeError("network down")

    pkt = await build_handoff_packet(
        session_id="s",
        reason="user_request",
        user_text="转人工",
        history=None,
        profile=None,
        live_context=None,
        llm_call=boom,
    )
    # 本地兜底:summary 与 suggested_replies 均回到模板
    assert "user_request" in pkt.summary
    assert pkt.suggested_replies
