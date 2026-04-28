"""/v1/ai/infer 转人工路径集成测试 — 验证 SSE 中带 handoff_packet 事件,且会 enqueue 到 routing-svc。"""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from ai_hub import main as main_mod
from ai_hub.faq_client import FaqClient
from ai_hub.main import create_app
from ai_hub.routing_client import RoutingClient


class NoFaq(FaqClient):
    def __init__(self):
        super().__init__("http://stub")

    async def match(self, query: str):  # type: ignore[override]
        return None

    async def hit(self, node_id: str) -> None:  # type: ignore[override]
        return None


class StubRouting(RoutingClient):
    def __init__(self):
        super().__init__("http://stub")
        self.calls: list[dict[str, Any]] = []

    async def enqueue(self, **kwargs):  # type: ignore[override]
        self.calls.append(kwargs)
        return {"id": "q_test123", **kwargs}


def parse_sse(text: str) -> list[dict[str, Any]]:
    out = []
    for line in text.splitlines():
        if line.startswith("data:"):
            try:
                out.append(json.loads(line[5:].strip()))
            except json.JSONDecodeError:
                pass
    return out


def test_handoff_emits_packet_and_enqueues(monkeypatch):
    """无 llm-router 时,handoff 走本地模板兜底,packet 产出 + 投到 routing-svc。"""

    async def fake_llm(**_kw):
        raise RuntimeError("no llm-router")

    monkeypatch.setattr(main_mod, "chat_once_full", fake_llm)

    routing = StubRouting()
    c = TestClient(create_app(faq_client=NoFaq(), routing_client=routing))
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
    assert handoff["enqueued"] is True
    assert handoff["queue_entry_id"] == "q_test123"

    # routing-svc 至少被调一次,带 packet
    assert len(routing.calls) == 1
    call = routing.calls[0]
    assert call["session_id"] == "ses_X"
    assert call["packet"]["reason"] == packet["reason"]


def test_minor_keyword_normalizes_to_minor_compliance(monkeypatch):
    async def fake_llm(**_kw):
        raise RuntimeError("no llm")

    monkeypatch.setattr(main_mod, "chat_once_full", fake_llm)
    routing = StubRouting()
    c = TestClient(create_app(faq_client=NoFaq(), routing_client=routing))
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
    # 应当用 packet.skill_group_hint(minor_compliance)进队
    assert routing.calls[0]["skill_group"] == "minor_compliance"


def test_handoff_resilient_when_routing_unavailable(monkeypatch):
    """routing-svc 异常时不阻塞 SSE,enqueued=false。"""

    async def fake_llm(**_kw):
        raise RuntimeError("no llm")

    monkeypatch.setattr(main_mod, "chat_once_full", fake_llm)

    class DownRouting(RoutingClient):
        def __init__(self):
            super().__init__("http://down")

        async def enqueue(self, **_kw):  # type: ignore[override]
            return None

    c = TestClient(create_app(faq_client=NoFaq(), routing_client=DownRouting()))
    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "我要投诉", "stream": True},
    )
    events = parse_sse(r.text)
    handoff = next(e for e in events if e.get("event") == "handoff")
    assert handoff["enqueued"] is False
    assert handoff["queue_entry_id"] is None
