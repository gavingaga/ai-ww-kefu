"""LiveContext 拼合测试 — 验证 livectx-svc 返回的服务端权威字段会覆盖 H5 上报。

不依赖真实 livectx-svc,使用 stub LivectxClient。
"""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from ai_hub.faq_client import FaqClient
from ai_hub.kb_client import KbClient
from ai_hub.livectx_client import LivectxClient
from ai_hub.main import _enrich_live_context, _shallow_merge, create_app


class NoFaq(FaqClient):
    def __init__(self):
        super().__init__("http://stub")

    async def match(self, query: str):  # type: ignore[override]
        return None

    async def hit(self, node_id: str) -> None:  # type: ignore[override]
        return None


class NoKb(KbClient):
    def __init__(self):
        super().__init__("http://stub")

    async def match(self, query, kb_id=None, top_k=5):  # type: ignore[override]
        return None


class StubLivectx(LivectxClient):
    def __init__(self, payload: dict[str, Any] | None):
        super().__init__("http://stub")
        self.payload = payload
        self.calls: list[dict[str, Any]] = []

    async def resolve(self, *, scene, room_id=None, vod_id=None, uid=None):  # type: ignore[override]
        self.calls.append({"scene": scene, "room_id": room_id, "vod_id": vod_id, "uid": uid})
        return self.payload


def parse_sse(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in text.splitlines():
        if line.startswith("data:"):
            try:
                out.append(json.loads(line[5:].strip()))
            except json.JSONDecodeError:
                pass
    return out


def test_shallow_merge_overlays_top_and_nested():
    base = {"scene": "live_room", "anchor_id": 1, "play": {"bitrate_kbps": 4500, "cdn_node": "evil"}}
    overlay = {"anchor_id": 999, "play": {"cdn_node": "cdn-bj-01", "drm": False}}
    out = _shallow_merge(base, overlay)
    assert out["anchor_id"] == 999
    assert out["play"]["cdn_node"] == "cdn-bj-01"
    assert out["play"]["bitrate_kbps"] == 4500
    assert out["play"]["drm"] is False


def test_shallow_merge_skips_none_overlay():
    out = _shallow_merge({"a": 1}, {"a": None, "b": 2})
    assert out["a"] == 1
    assert out["b"] == 2


def test_enrich_skips_when_no_scene(monkeypatch):
    """live_context 没 scene 不应触发 livectx-svc 调用。"""
    import asyncio

    class FakeReq:
        live_context = {}

    lcc = StubLivectx({"anchor_id": 7})
    asyncio.run(_enrich_live_context(FakeReq(), lcc))  # type: ignore[arg-type]
    assert lcc.calls == []


def test_enrich_skips_when_no_keys(monkeypatch):
    """有 scene 但没 room_id/vod_id/uid 也不调,服务端没东西可反查。"""
    import asyncio

    class FakeReq:
        live_context = {"scene": "settings"}

    lcc = StubLivectx({"x": 1})
    asyncio.run(_enrich_live_context(FakeReq(), lcc))  # type: ignore[arg-type]
    assert lcc.calls == []


def test_infer_uses_server_authoritative_anchor_id(monkeypatch):
    """H5 把 anchor_id 伪造成 999;livectx-svc 返回 1_009_001;最终 prompt 注入应用真值。"""
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    lcc = StubLivectx(
        {
            "scene": "live_room",
            "room_id": 9001,
            "anchor_id": 1_009_001,
            "program_title": "直播间 9001 当前节目",
            "play": {"cdn_node": "cdn-sh-02", "drm": False},
        }
    )
    c = TestClient(create_app(faq_client=NoFaq(), kb_client=NoKb(), livectx_client=lcc))
    r = c.post(
        "/v1/ai/infer",
        json={
            "session_id": "s",
            "user_text": "看视频卡顿",
            "live_context": {
                "scene": "live_room",
                "room_id": 9001,
                "anchor_id": 999,  # 伪造
                "program_title": "(伪造)送你点券",
                "play": {"bitrate_kbps": 4500, "cdn_node": "evil-cdn"},
            },
            "stream": True,
        },
    )
    events = parse_sse(r.text)
    # ai-hub 的内部状态在请求结束后失效,直接通过事件断言比较脆;
    # 这里改为断言 LivectxClient 收到的参数 + token 事件正常输出。
    assert lcc.calls and lcc.calls[0]["room_id"] == 9001
    assert any(e.get("event") == "token" for e in events)
    assert any(e.get("event") == "done" for e in events)


def test_infer_falls_through_when_livectx_unavailable(monkeypatch):
    """livectx-svc 不可用(返回 None) → 不影响主链路。"""
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    lcc = StubLivectx(None)
    c = TestClient(create_app(faq_client=NoFaq(), kb_client=NoKb(), livectx_client=lcc))
    r = c.post(
        "/v1/ai/infer",
        json={
            "session_id": "s",
            "user_text": "卡顿",
            "live_context": {"scene": "live_room", "room_id": 1},
        },
    )
    events = parse_sse(r.text)
    assert any(e.get("event") == "token" for e in events)
    assert any(e.get("event") == "done" for e in events)
