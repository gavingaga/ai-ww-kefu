"""ai-hub → llm-router 的 SSE 客户端。

把 llm-router 的 ``data: {chunk}\\n\\n`` 解析成 dict;对外暴露 :func:`chat_stream`。

本地无 llm-router 时,可设 ``AI_HUB_LLM_INLINE_MOCK=1`` 走内置 mock(用于离线开发)。
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _inline_mock_enabled() -> bool:
    return os.getenv("AI_HUB_LLM_INLINE_MOCK", "").lower() in {"1", "true", "yes"}


async def _inline_mock(messages: list[dict[str, Any]]) -> AsyncIterator[dict[str, Any]]:
    last = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "(空)")
    text = f"(inline-mock) 你说:{last}。LLM 真实接入待 llm-router 上线。"
    for i in range(0, len(text), 8):
        yield {"choices": [{"delta": {"content": text[i : i + 8]}}]}
    yield {"event": "done"}


async def chat_stream(
    *,
    base_url: str,
    profile_id: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    extra_params: dict[str, Any] | None = None,
    timeout_s: float = 30.0,
) -> AsyncIterator[dict[str, Any]]:
    """流式调 llm-router /v1/chat/completions(stream=true)。"""
    if _inline_mock_enabled():
        async for c in _inline_mock(messages):
            yield c
        return

    body: dict[str, Any] = {"messages": messages, "stream": True, **(extra_params or {})}
    if tools:
        body["tools"] = tools
    headers = {"X-Profile-Id": profile_id, "Content-Type": "application/json"}
    url = base_url.rstrip("/") + "/v1/chat/completions"
    timeout = httpx.Timeout(connect=5.0, read=timeout_s, write=5.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, headers=headers, json=body) as resp:
            if resp.status_code // 100 != 2:
                err = (await resp.aread()).decode("utf-8", errors="ignore")
                raise RuntimeError(f"llm-router {resp.status_code}: {err[:300]}")
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    yield {"event": "done"}
                    break
                try:
                    yield json.loads(payload)
                except json.JSONDecodeError:
                    logger.warning("ai-hub: bad SSE chunk %r", payload[:80])
                    continue
