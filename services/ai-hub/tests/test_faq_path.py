"""FAQ 通道集成测试 — 用 stub FaqClient 不依赖真实 notify-svc。"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from ai_hub.faq_client import FaqClient
from ai_hub.main import create_app


class StubFaqClient(FaqClient):
    """让单测可控:hit_payload 命中即返,None 走 fallback。"""

    def __init__(self, hit_payload: dict[str, Any] | None):
        super().__init__("http://stub")
        self.hit_payload = hit_payload
        self.recorded: list[str] = []

    async def match(self, query: str):  # type: ignore[override]
        return self.hit_payload

    async def hit(self, node_id: str) -> None:  # type: ignore[override]
        self.recorded.append(node_id)


def parse_sse(text: str) -> list[str]:
    return [ln[5:].strip() for ln in text.splitlines() if ln.startswith("data:")]


def test_faq_exact_short_circuit_no_llm(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")  # 即便 fallback 到 LLM 也不打外网
    stub = StubFaqClient(
        {
            "hit": True,
            "how": "exact",
            "score": 1.0,
            "node_id": "play.buffer",
            "title": "我看视频卡顿怎么办?",
            "answer": {"contentMd": "切到 480p 试试"},
        }
    )
    c = TestClient(create_app(faq_client=stub))
    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "我看视频卡顿怎么办?", "stream": True},
    )
    assert r.status_code == 200
    events = parse_sse(r.text)
    # 应当出现 decision=faq + 一条 faq 事件 + done;不应出现 token
    assert any('"action":"faq"' in e or '"action": "faq"' in e for e in events)
    assert any('"event":"faq"' in e or '"event": "faq"' in e for e in events)
    assert all('"event":"token"' not in e and '"event": "token"' not in e for e in events)
    assert stub.recorded == ["play.buffer"]


def test_faq_miss_falls_back_to_llm(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    stub = StubFaqClient(None)  # 未命中
    c = TestClient(create_app(faq_client=stub))
    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "晚上看 NBA 几点开始?", "stream": True},
    )
    assert r.status_code == 200
    events = parse_sse(r.text)
    # 走到 LLM_GENERAL,应该有 token + done,不应有 faq 事件
    assert any('"action":"llm_general"' in e or '"action": "llm_general"' in e for e in events)
    assert any('"event":"token"' in e or '"event": "token"' in e for e in events)
    assert all('"event":"faq"' not in e and '"event": "faq"' not in e for e in events)


def test_handoff_keyword_outranks_faq(monkeypatch):
    """关键词命中转人工,不调用 FAQ(也无 token)。"""
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    stub = StubFaqClient({"hit": True, "node_id": "irrelevant"})
    c = TestClient(create_app(faq_client=stub))
    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "我要投诉这个主播", "stream": True},
    )
    events = parse_sse(r.text)
    assert any('"action":"handoff"' in e or '"action": "handoff"' in e for e in events)
    assert all('"event":"faq"' not in e and '"event": "faq"' not in e for e in events)
    assert stub.recorded == []
