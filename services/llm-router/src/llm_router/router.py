"""路由层 — 把"profile_id + messages"转成实际的 LLM 调用,沿 fallback 链尝试。"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from .health import HealthTracker
from .openai_adapter import LLMError, chat_once, chat_once_full, chat_stream
from .profiles import ProfileRegistry

logger = logging.getLogger(__name__)


class Router:
    def __init__(self, registry: ProfileRegistry, health: HealthTracker | None = None):
        self.registry = registry
        self.health = health or HealthTracker()

    async def stream(
        self,
        profile_id: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        extra_params: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """沿 fallback 链流式;只在第一档全失败时切下一档(避免半路串话)。"""
        chain = self.registry.chain(profile_id)
        if not chain:
            raise LLMError(404, f"profile not found: {profile_id}")

        last_err: Exception | None = None
        for attempt, profile in enumerate(chain):
            started = time.perf_counter()
            received_any = False
            try:
                async for chunk in chat_stream(profile, messages, tools, extra_params):
                    received_any = True
                    yield {**chunk, "_profile_id": profile.id}
                self.health.record(profile.id, (time.perf_counter() - started) * 1000, True)
                return
            except LLMError as e:
                last_err = e
                self.health.record(
                    profile.id, (time.perf_counter() - started) * 1000, False, str(e)
                )
                if received_any:
                    # 已开始流式输出,半路失败不切档,避免给客户端拼出错乱文本
                    raise
                logger.warning(
                    "llm stream attempt=%d profile=%s failed: %s; trying fallback",
                    attempt,
                    profile.id,
                    e,
                )
                continue
            except Exception as e:  # noqa: BLE001
                last_err = e
                self.health.record(
                    profile.id, (time.perf_counter() - started) * 1000, False, str(e)
                )
                if received_any:
                    raise
                continue
        assert last_err is not None
        raise last_err

    async def once(self, profile_id: str, messages: list[dict[str, Any]]) -> str:
        chain = self.registry.chain(profile_id)
        if not chain:
            raise LLMError(404, f"profile not found: {profile_id}")
        last_err: Exception | None = None
        for profile in chain:
            started = time.perf_counter()
            try:
                text = await chat_once(profile, messages)
                self.health.record(profile.id, (time.perf_counter() - started) * 1000, True)
                return text
            except Exception as e:  # noqa: BLE001
                last_err = e
                self.health.record(
                    profile.id, (time.perf_counter() - started) * 1000, False, str(e)
                )
                continue
        assert last_err is not None
        raise last_err

    async def once_full(
        self,
        profile_id: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        extra_params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """非流式 + 透传完整 OpenAI 响应(含 tool_calls),供 ai-hub 工具循环使用。"""
        chain = self.registry.chain(profile_id)
        if not chain:
            raise LLMError(404, f"profile not found: {profile_id}")
        last_err: Exception | None = None
        for profile in chain:
            started = time.perf_counter()
            try:
                data = await chat_once_full(
                    profile, messages, tools=tools, extra_params=extra_params
                )
                self.health.record(profile.id, (time.perf_counter() - started) * 1000, True)
                data["_profile_id"] = profile.id
                return data
            except Exception as e:  # noqa: BLE001
                last_err = e
                self.health.record(
                    profile.id, (time.perf_counter() - started) * 1000, False, str(e)
                )
                continue
        assert last_err is not None
        raise last_err
