"""ai-hub 决策路径回归测试集 — 5 路径金标。

接 T-505:每次发布前跑这一组,任意金标失败立即阻塞上线。
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from ai_hub.faq_client import FaqClient
from ai_hub.kb_client import KbClient
from ai_hub.main import _enrich_live_context  # 保证联调流程一致
from ai_hub.main import _shallow_merge  # type: ignore  # noqa: F401  (不直接用,只确保模块可导入)
from ai_hub.main import create_app
from ai_hub.livectx_client import LivectxClient


class StubFaq(FaqClient):
    def __init__(self, hit: dict[str, Any] | None = None):
        super().__init__("http://stub")
        self._hit = hit

    async def match(self, query: str):  # type: ignore[override]
        return self._hit

    async def hit(self, node_id: str) -> None:  # type: ignore[override]
        return None


class StubKb(KbClient):
    def __init__(self, hit: dict[str, Any] | None = None):
        super().__init__("http://stub")
        self._hit = hit

    async def match(self, query, kb_id=None, top_k=5):  # type: ignore[override]
        return self._hit


class StubLivectx(LivectxClient):
    def __init__(self):
        super().__init__("http://stub")

    async def resolve(self, *, scene, room_id=None, vod_id=None, uid=None):  # type: ignore[override]
        return None


# ───── 5 路径金标 ─────


HANDOFF_CASES = [
    ("我要投诉这个主播", "rule_keyword"),
    ("孩子打赏了,我是未成年监护人,要退款", "rule_keyword"),
    ("帮我转人工", "rule_keyword"),
]

LLM_CASES = [
    "晚上几点上新番",
    "怎么开播",
    "礼物有什么类型",
]


@pytest.mark.parametrize("text,expected_reason", HANDOFF_CASES)
def test_decide_route_handoff(monkeypatch, text, expected_reason):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    from fastapi.testclient import TestClient

    app = create_app(faq_client=StubFaq(None), kb_client=StubKb(None), livectx_client=StubLivectx())
    client = TestClient(app)
    r = client.post("/v1/ai/decide", json={"session_id": "s", "user_text": text})
    assert r.status_code == 200
    body = r.json()
    assert body["would_route"] == "handoff", f"{text} → {body}"
    assert body["decision"]["reason"] == expected_reason


@pytest.mark.parametrize("text", LLM_CASES)
def test_decide_route_llm_default(monkeypatch, text):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    from fastapi.testclient import TestClient

    app = create_app(faq_client=StubFaq(None), kb_client=StubKb(None), livectx_client=StubLivectx())
    client = TestClient(app)
    r = client.post("/v1/ai/decide", json={"session_id": "s", "user_text": text})
    assert r.json()["would_route"] == "llm_general"


def test_decide_route_faq(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    from fastapi.testclient import TestClient

    faq = StubFaq(
        {
            "hit": True,
            "node_id": "play.buffer",
            "title": "我看视频卡顿怎么办?",
            "how": "exact",
            "score": 1.0,
        }
    )
    app = create_app(faq_client=faq, kb_client=StubKb(None), livectx_client=StubLivectx())
    client = TestClient(app)
    r = client.post(
        "/v1/ai/decide", json={"session_id": "s", "user_text": "视频卡顿"}
    )
    body = r.json()
    assert body["would_route"] == "faq"
    assert body["faq"]["node_id"] == "play.buffer"


def test_decide_route_rag(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    monkeypatch.setenv("AI_HUB_RAG_THRESHOLD", "0.4")
    from fastapi.testclient import TestClient

    kb = StubKb({"hit": True, "score": 0.78, "top_title": "卡顿排查", "chunks": [{"chunk_id": "c"}]})
    app = create_app(faq_client=StubFaq(None), kb_client=kb, livectx_client=StubLivectx())
    client = TestClient(app)
    r = client.post(
        "/v1/ai/decide", json={"session_id": "s", "user_text": "未知问题需要RAG"}
    )
    body = r.json()
    assert body["would_route"] == "rag"
    assert body["rag"]["top_title"] == "卡顿排查"


def test_enrich_live_context_does_not_crash_with_stub():
    """烟雾测试:_enrich_live_context 在 stub 不可达时静默 fallthrough。"""

    class Req:
        live_context = {"scene": "live_room", "room_id": 1}

    asyncio.run(_enrich_live_context(Req(), StubLivectx()))  # type: ignore[arg-type]
