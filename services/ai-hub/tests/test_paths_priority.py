"""ai-hub /v1/ai/infer 五条路径优先级矩阵测试。

PRD 03 §2.2 决策优先级:HANDOFF(规则) → FAQ → TOOL → RAG → LLM_GENERAL → 兜底。
本测试用一组 stub client(FAQ / KB / Routing / LLM)对应固定输入,验证:

  1. handoff 命中时,FAQ / RAG / Tool 都不被调用
  2. FAQ 命中时,RAG / Tool / LLM 都不触发(零 token)
  3. Tool 在请求侧未启用时,RAG + LLM 一起走
  4. RAG 命中(含 chunks);RAG 不命中时降级到 LLM
  5. 全部 fallback 时只走 LLM_GENERAL

主要解决"绕过决策器导致回归"的隐患 — 任何一路改动后这一文件要继续绿。
"""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from ai_hub.faq_client import FaqClient
from ai_hub.kb_client import KbClient
from ai_hub.main import create_app
from ai_hub.routing_client import RoutingClient


class RecordingFaq(FaqClient):
    def __init__(self, hit: dict[str, Any] | None):
        super().__init__("http://stub")
        self._hit = hit
        self.match_calls = 0
        self.hit_calls: list[str] = []

    async def match(self, query: str):  # type: ignore[override]
        self.match_calls += 1
        return self._hit

    async def hit(self, node_id: str) -> None:  # type: ignore[override]
        self.hit_calls.append(node_id)


class RecordingKb(KbClient):
    def __init__(self, hit: dict[str, Any] | None):
        super().__init__("http://stub")
        self._hit = hit
        self.match_calls = 0

    async def match(self, query, kb_id=None, top_k=5):  # type: ignore[override]
        self.match_calls += 1
        return self._hit


class RecordingRouting(RoutingClient):
    def __init__(self):
        super().__init__("http://stub")
        self.enqueued: list[dict[str, Any]] = []

    async def enqueue(self, **kwargs):  # type: ignore[override]
        self.enqueued.append(kwargs)
        return {"id": "q_t", **kwargs}


def parse_sse(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in text.splitlines():
        if line.startswith("data:"):
            try:
                out.append(json.loads(line[5:].strip()))
            except json.JSONDecodeError:
                pass
    return out


def kinds(events: list[dict[str, Any]]) -> list[str]:
    return [e.get("event", "") for e in events]


# ───── 1. handoff 命中时所有下游通道都被短路 ─────


def test_handoff_short_circuits_faq_kb_and_llm(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    faq = RecordingFaq({"hit": True, "node_id": "should_not_run"})
    kb = RecordingKb({"hit": True, "score": 0.99, "rendered": "x", "chunks": []})
    routing = RecordingRouting()
    c = TestClient(create_app(faq_client=faq, kb_client=kb, routing_client=routing))

    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "我要投诉这个主播"},
    )
    events = parse_sse(r.text)
    ks = kinds(events)

    assert "handoff" in ks
    assert "faq" not in ks
    assert "rag_chunks" not in ks
    assert "token" not in ks
    assert "tool_call" not in ks
    assert faq.match_calls == 0, "FAQ 不应被调用"
    assert kb.match_calls == 0, "KB 不应被调用"
    assert len(routing.enqueued) == 1


# ───── 2. FAQ 命中时,后续 RAG/LLM 都不应触发 ─────


def test_faq_hit_skips_rag_and_llm(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    faq = RecordingFaq(
        {
            "hit": True,
            "how": "exact",
            "score": 1.0,
            "node_id": "play.buffer",
            "title": "我看视频卡顿怎么办?",
            "answer": {"contentMd": "切到 480p 试试"},
        }
    )
    kb = RecordingKb({"hit": True, "score": 0.9, "rendered": "x", "chunks": [{"chunk_id": "c1"}]})
    c = TestClient(create_app(faq_client=faq, kb_client=kb))

    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "我看视频卡顿怎么办?"},
    )
    events = parse_sse(r.text)
    ks = kinds(events)

    assert "faq" in ks
    assert "token" not in ks, "FAQ 命中应零 token"
    assert "rag_chunks" not in ks, "FAQ 命中后 KB 不应被查"
    assert "tool_call" not in ks
    assert faq.match_calls == 1
    assert kb.match_calls == 0
    assert faq.hit_calls == ["play.buffer"]


# ───── 3. FAQ 未命中 + RAG 命中 → 走 LLM 但带引用 ─────


def test_rag_hit_with_faq_miss_routes_to_llm_with_chunks(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    faq = RecordingFaq(None)
    kb = RecordingKb(
        {
            "hit": True,
            "score": 0.78,
            "top_title": "卡顿排查",
            "rendered": "[卡顿排查] 480p / 切节点 / 重进直播间。",
            "chunks": [
                {"chunk_id": "kbA-3", "title": "卡顿排查", "content": "建议 480p", "score": 0.78}
            ],
        }
    )
    c = TestClient(create_app(faq_client=faq, kb_client=kb))

    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "视频一直卡,怎么办"},
    )
    events = parse_sse(r.text)
    ks = kinds(events)

    assert "faq" not in ks
    assert "rag_chunks" in ks
    rag = next(e for e in events if e.get("event") == "rag_chunks")
    assert rag["top_title"] == "卡顿排查"
    assert rag["chunks"][0]["chunk_id"] == "kbA-3"
    assert "token" in ks
    assert faq.match_calls == 1
    assert kb.match_calls == 1


# ───── 4. RAG 低于阈值 → 直接走 LLM,不发 rag_chunks 事件 ─────


def test_rag_below_threshold_falls_through_to_llm(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    monkeypatch.setenv("AI_HUB_RAG_THRESHOLD", "0.9")
    faq = RecordingFaq(None)
    kb = RecordingKb({"hit": True, "score": 0.4, "rendered": "weak", "chunks": []})
    c = TestClient(create_app(faq_client=faq, kb_client=kb))

    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "随便聊聊"},
    )
    events = parse_sse(r.text)
    ks = kinds(events)
    assert "rag_chunks" not in ks
    assert "token" in ks
    assert "done" in ks


# ───── 5. 全部 fallback → 默认 LLM_GENERAL ─────


def test_all_fallback_runs_llm_general(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    faq = RecordingFaq(None)
    kb = RecordingKb(None)
    c = TestClient(create_app(faq_client=faq, kb_client=kb))

    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "你们什么时候上新番"},
    )
    events = parse_sse(r.text)
    ks = kinds(events)
    assert any(
        e.get("event") == "decision" and e.get("action") == "llm_general" for e in events
    )
    assert "faq" not in ks
    assert "rag_chunks" not in ks
    assert "tool_call" not in ks
    assert "token" in ks


# ───── 6. tool_calls 路径 — req.tools 为空时绝不触发工具循环 ─────


def test_tools_disabled_when_request_omits_whitelist(monkeypatch):
    """req.tools 默认 None == 显式禁用工具循环;即便有 RAG 命中也不应触发 tool_call。"""
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    faq = RecordingFaq(None)
    kb = RecordingKb(
        {
            "hit": True,
            "score": 0.8,
            "top_title": "知识",
            "rendered": "[知识] x",
            "chunks": [{"chunk_id": "c", "title": "t", "content": "c", "score": 0.8}],
        }
    )
    c = TestClient(create_app(faq_client=faq, kb_client=kb))

    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "诊断一下流"},
    )
    events = parse_sse(r.text)
    ks = kinds(events)
    assert "tool_call" not in ks
    assert "rag_chunks" in ks
    assert "token" in ks


# ───── 7. 空文本仍会发 decision/done(默认 llm_general) ─────


def test_empty_user_text_still_emits_decision_and_done(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    faq = RecordingFaq(None)
    kb = RecordingKb(None)
    c = TestClient(create_app(faq_client=faq, kb_client=kb))
    r = c.post("/v1/ai/infer", json={"session_id": "s", "user_text": ""})
    events = parse_sse(r.text)
    ks = kinds(events)
    assert "decision" in ks
    assert "done" in ks
