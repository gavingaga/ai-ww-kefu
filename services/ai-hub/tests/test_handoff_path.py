"""/v1/ai/infer 转人工路径集成测试 — 验证 SSE 中带 handoff_packet 事件。"""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from ai_hub import main as main_mod
from ai_hub.faq_client import FaqClient
from ai_hub.main import create_app


class NoFaq(FaqClient):
    def __init__(self):
        super().__init__("http://stub")

    async def match(self, query: str):  # type: ignore[override]
        return None

    async def hit(self, node_id: str) -> None:  # type: ignore[override]
        return None


def parse_sse(text: str) -> list[dict[str, Any]]:
    out = []
    for line in text.splitlines():
        if line.startswith("data:"):
            try:
                out.append(json.loads(line[5:].strip()))
            except json.JSONDecodeError:
                pass
    return out


def test_handoff_emits_packet_with_local_fallback(monkeypatch):
    """无 llm-router 时,handoff 走本地模板兜底,packet 仍能产出。"""

    async def fake_llm(**_kw):
        raise RuntimeError("no llm-router")

    monkeypatch.setattr(main_mod, "chat_once_full", fake_llm)

    c = TestClient(create_app(faq_client=NoFaq()))
    r = c.post(
        "/v1/ai/infer",
        json={
            "session_id": "ses_X",
            "user_text": "我要投诉这个主播,涉黄",
            "live_context": {"scene": "live_room", "room_id": 8001},
            "stream": True,
        },
    )
    assert r.status_code == 200
    events = parse_sse(r.text)
    kinds = [e.get("event") for e in events]
    assert "handoff_packet" in kinds
    assert "handoff" in kinds
    assert "done" in kinds
    packet = next(e for e in events if e.get("event") == "handoff_packet")
    assert packet["session_id"] == "ses_X"
    assert packet["reason"] in {"report_compliance", "rule_keyword"}
    assert packet["entities"]["room_id"] == 8001
    assert packet["suggested_replies"]
    handoff = next(e for e in events if e.get("event") == "handoff")
    assert handoff["summary"] == packet["summary"]


def test_minor_keyword_normalizes_to_minor_compliance(monkeypatch):
    async def fake_llm(**_kw):
        raise RuntimeError("no llm")

    monkeypatch.setattr(main_mod, "chat_once_full", fake_llm)
    c = TestClient(create_app(faq_client=NoFaq()))
    r = c.post(
        "/v1/ai/infer",
        json={
            "session_id": "s",
            "user_text": "孩子未成年充值了 3000 元,要退款",
            "stream": True,
        },
    )
    events = parse_sse(r.text)
    packet = next(e for e in events if e.get("event") == "handoff_packet")
    assert packet["reason"] == "minor_compliance"
    assert packet["skill_group_hint"] == "minor_compliance"
    assert packet["entities"].get("amount_hint") == "3000"
