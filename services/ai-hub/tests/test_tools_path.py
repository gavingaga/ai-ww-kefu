"""/v1/ai/infer 工具循环路径集成测试 — 用 monkeypatch 替换 chat_once_full + chat_stream。"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
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


def test_tools_path_emits_tool_call_then_token(monkeypatch):
    """LLM 第一次返回 tool_calls;ToolLoop 执行;第二次返回纯文本作为 final_text。"""
    seq = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {
                        "name": "get_play_diagnostics",
                        "arguments": json.dumps({"room_id": 8001}),
                    },
                }
            ],
        },
        {"role": "assistant", "content": "建议切到 480p,尝试 1 / 2 / 3。"},
    ]
    calls: list[int] = []

    async def fake_chat_once_full(**_kw):
        idx = len(calls)
        calls.append(idx)
        msg = seq[min(idx, len(seq) - 1)]
        finish = "tool_calls" if msg.get("tool_calls") else "stop"
        return {"choices": [{"message": msg, "finish_reason": finish}]}

    async def fake_chat_stream(**_kw) -> AsyncIterator[dict[str, Any]]:
        # 不应被走到(loop.final_text 已就绪)
        yield {"choices": [{"delta": {"content": ""}}]}
        yield {"event": "done"}

    monkeypatch.setattr(main_mod, "chat_once_full", fake_chat_once_full)
    monkeypatch.setattr(main_mod, "chat_stream", fake_chat_stream)

    c = TestClient(create_app(faq_client=NoFaq()))
    r = c.post(
        "/v1/ai/infer",
        json={
            "session_id": "s",
            "user_text": "卡顿",
            "live_context": {
                "scene": "live_room",
                "room_id": 8001,
                "play": {"buffer_events_60s": 8, "cdn_node": "sh-3"},
                "network": {"downlink_mbps": 1.0},
            },
            "tools": ["get_play_diagnostics"],
            "stream": True,
        },
    )
    assert r.status_code == 200
    events = parse_sse(r.text)
    kinds = [e.get("event") for e in events]
    assert "decision" in kinds
    assert "tool_call" in kinds
    assert "prompt_template" in kinds
    assert "token" in kinds
    assert "done" in kinds
    # 工具结果应来自 default_registry 的 mock 实现
    tool_event = next(e for e in events if e.get("event") == "tool_call")
    assert tool_event["ok"] is True
    assert tool_event["result"]["verdict"] == "local_network"
    final_token = next(e for e in events if e.get("event") == "token")
    assert "480p" in final_token["text"]


def test_tools_disabled_when_empty_list(monkeypatch):
    """tools=[] 显式禁用工具循环;走原流式路径。"""
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    c = TestClient(create_app(faq_client=NoFaq()))
    r = c.post(
        "/v1/ai/infer",
        json={"session_id": "s", "user_text": "你好", "tools": [], "stream": True},
    )
    events = parse_sse(r.text)
    kinds = [e.get("event") for e in events]
    assert "tool_call" not in kinds
    assert "token" in kinds
    assert "done" in kinds
