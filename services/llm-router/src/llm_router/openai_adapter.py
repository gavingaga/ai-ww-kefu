"""OpenAI Chat Completions 适配。

非 OpenAI 协议(如 Anthropic)的转换在此扩展;当前 M2 仅实现 OpenAI / openai_compatible
路径,Azure OpenAI 仅 base_url 形态不同 — 这两者的 wire 兼容,无需特殊处理。
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .profiles import ModelProfile

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """LLM 调用失败。"""

    def __init__(self, status: int, body: str):
        super().__init__(f"llm error {status}: {body[:200]}")
        self.status = status
        self.body = body


def _is_mock_mode() -> bool:
    return os.getenv("LLM_MOCK", "").lower() in {"1", "true", "yes"}


async def chat_stream(
    profile: ModelProfile,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    extra_params: dict[str, Any] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """流式聊天:逐条 yield OpenAI Chat Completions chunk(已 JSON 解析)。

    最后一条 chunk 通常是 ``[DONE]`` 哨兵 — 此处转译为 ``{"event": "done"}``。
    """
    if _is_mock_mode():
        async for c in _mock_stream(messages):
            yield c
        return

    body: dict[str, Any] = {
        "model": profile.model,
        "messages": messages,
        "stream": True,
        **profile.params,
        **(extra_params or {}),
    }
    if tools:
        body["tools"] = tools

    headers = {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(connect=5.0, read=profile.timeout_ms / 1000, write=5.0, pool=5.0)
    url = profile.base_url.rstrip("/") + "/chat/completions"

    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code // 100 != 2:
                    text = (await resp.aread()).decode("utf-8", errors="ignore")
                    raise LLMError(resp.status_code, text)
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        yield {"event": "done"}
                        break
                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    yield chunk
        finally:
            logger.debug(
                "llm chat_stream profile=%s model=%s elapsed=%.0fms",
                profile.id,
                profile.model,
                (time.perf_counter() - started) * 1000,
            )


async def chat_once(
    profile: ModelProfile,
    messages: list[dict[str, Any]],
    extra_params: dict[str, Any] | None = None,
) -> str:
    """非流式调用,返回单条文本(供测试连接 / 试聊)。"""
    data = await chat_once_full(profile, messages, extra_params=extra_params)
    return data["choices"][0]["message"].get("content") or ""


async def chat_once_full(
    profile: ModelProfile,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    extra_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """非流式调用,返回完整 OpenAI 响应(包含 tool_calls)。"""
    if _is_mock_mode():
        text = ""
        async for c in _mock_stream(messages):
            text += c.get("choices", [{}])[0].get("delta", {}).get("content", "")
        return {
            "id": "cmpl-mock",
            "object": "chat.completion",
            "model": profile.model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": text or "(mock) ok"},
                    "finish_reason": "stop",
                }
            ],
        }

    body: dict[str, Any] = {
        "model": profile.model,
        "messages": messages,
        "stream": False,
        **profile.params,
        **(extra_params or {}),
    }
    if tools:
        body["tools"] = tools
    headers = {"Authorization": f"Bearer {profile.api_key}", "Content-Type": "application/json"}
    timeout = httpx.Timeout(connect=5.0, read=profile.timeout_ms / 1000, write=5.0, pool=5.0)
    url = profile.base_url.rstrip("/") + "/chat/completions"
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code // 100 != 2:
            raise LLMError(resp.status_code, resp.text)
        return resp.json()


async def _mock_stream(messages: list[dict[str, Any]]) -> AsyncIterator[dict[str, Any]]:
    """开发期 mock:把最后一条用户消息以 token 形式分块回放。"""
    last_user = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"), "(空)"
    )
    text = f"(mock) 收到你的问题:{last_user}。这条回复来自 LLM_MOCK=1。"
    for i in range(0, len(text), 6):
        yield {
            "choices": [{"index": 0, "delta": {"content": text[i : i + 6]}, "finish_reason": None}],
        }
    yield {"event": "done"}
