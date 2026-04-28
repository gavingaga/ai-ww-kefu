"""ai-hub RAG 通道集成测试 — 用 stub KbClient 不依赖 kb-svc。"""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from ai_hub.faq_client import FaqClient
from ai_hub.kb_client import KbClient
from ai_hub.main import create_app


class NoFaq(FaqClient):
    def __init__(self):
        super().__init__("http://stub")

    async def match(self, query: str):  # type: ignore[override]
        return None

    async def hit(self, node_id: str) -> None:  # type: ignore[override]
        return None


class StubKb(KbClient):
    def __init__(self, hit: dict[str, Any] | None):
        super().__init__("http://stub")
        self.hit_payload = hit
        self.calls: list[str] = []

    async def match(self, query, kb_id=None, top_k=5):  # type: ignore[override]
        self.calls.append(query)
        return self.hit_payload


def parse_sse(text: str) -> list[dict[str, Any]]:
    out = []
    for line in text.splitlines():
        if line.startswith("data:"):
            try:
                out.append(json.loads(line[5:].strip()))
            except json.JSONDecodeError:
                pass
    return out


def test_rag_hit_emits_chunks_and_injects_into_prompt(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    kb = StubKb(
        {
            "hit": True,
            "score": 0.78,
            "top_title": "卡顿排查标准答复",
            "rendered": "[卡顿排查标准答复] 切到 480p、切换 Wi-Fi、退出直播间重新进入。",
            "chunks": [
                {
                    "chunk_id": "doc_buffer#0",
                    "title": "卡顿排查标准答复",
                    "content": "切到 480p、切换 Wi-Fi、退出直播间重新进入。",
                    "score": 0.78,
                }
            ],
        }
    )
    c = TestClient(create_app(faq_client=NoFaq(), kb_client=kb))
    r = c.post(
        "/v1/ai/infer",
        json={
            "session_id": "s",
            "user_text": "视频卡顿怎么办",
            "live_context": {"scene": "live_room"},
            "stream": True,
        },
    )
    events = parse_sse(r.text)
    kinds = [e.get("event") for e in events]
    assert "rag_chunks" in kinds
    rag = next(e for e in events if e.get("event") == "rag_chunks")
    assert rag["top_title"] == "卡顿排查标准答复"
    assert rag["chunks"]
    assert any(e.get("event") == "token" for e in events)


def test_rag_below_threshold_skips(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    monkeypatch.setenv("AI_HUB_RAG_THRESHOLD", "0.9")
    kb = StubKb({"hit": True, "score": 0.4, "rendered": "low", "chunks": []})
    c = TestClient(create_app(faq_client=NoFaq(), kb_client=kb))
    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "any", "stream": True},
    )
    events = parse_sse(r.text)
    kinds = [e.get("event") for e in events]
    assert "rag_chunks" not in kinds
    assert "token" in kinds
    assert "done" in kinds


def test_rag_unavailable_falls_through(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")

    class DownKb(KbClient):
        def __init__(self):
            super().__init__("http://down")

        async def match(self, *a, **kw):  # type: ignore[override]
            raise RuntimeError("kb-svc down")

    c = TestClient(create_app(faq_client=NoFaq(), kb_client=DownKb()))
    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "查询节目", "stream": True},
    )
    events = parse_sse(r.text)
    kinds = [e.get("event") for e in events]
    assert "rag_chunks" not in kinds
    assert "token" in kinds
    assert "done" in kinds
