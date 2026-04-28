"""工具调用循环(Function Calling)— OpenAI 协议。

流程:
    1. 拼上 ``tools=[…]`` 调一次非流式 chat
    2. 若 ``finish_reason="tool_calls"``,顺序执行每个 tool_call(写操作 dry_run)
    3. 把执行结果以 ``role="tool"`` 添加到 messages,再调一次 chat
    4. 直到没有 tool_calls 或达到 max_depth(默认 3),返回最终 messages

为方便单测,LLM 与工具执行都通过协议参数注入,核心算法不依赖网络。
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from .tools.registry import Tool, ToolContext, ToolError, ToolRegistry

logger = logging.getLogger(__name__)


# 注入式 LLM 调用 — 输入 messages + tools schema,输出完整 OpenAI 响应
LLMCall = Callable[
    [list[dict[str, Any]], list[dict[str, Any]] | None],
    Awaitable[dict[str, Any]],
]


@dataclass
class ToolEvent:
    """循环内单个工具调用的可观测记录。"""

    name: str
    args: dict[str, Any]
    ok: bool
    result: Any = None
    error: str = ""


@dataclass
class LoopResult:
    messages: list[dict[str, Any]]
    final_text: str = ""
    rounds: int = 0
    events: list[ToolEvent] = field(default_factory=list)
    finish_reason: str = ""

    @property
    def tool_results_summary(self) -> dict[str, Any]:
        """供 prompt 注入的简化结构。"""
        return {e.name: e.result for e in self.events if e.ok}


async def run_tool_loop(
    *,
    llm_call: LLMCall,
    registry: ToolRegistry,
    base_messages: list[dict[str, Any]],
    ctx: ToolContext,
    tool_names: list[str] | None = None,
    max_depth: int = 3,
) -> LoopResult:
    """执行多轮工具调用循环。"""
    messages = [m for m in base_messages]  # 浅拷贝;循环内追加
    schema = registry.to_openai(tool_names)
    events: list[ToolEvent] = []
    final_text = ""
    finish_reason = ""

    for depth in range(max_depth):
        resp = await llm_call(messages, schema)
        choice = (resp.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        finish_reason = choice.get("finish_reason") or ""
        tool_calls = msg.get("tool_calls") or []

        if tool_calls:
            # 必须把 assistant message(包含 tool_calls)原样追加,然后是各个 tool 结果
            messages.append(_assistant_with_tool_calls(msg))
            for tc in tool_calls:
                ev = await _execute_tool_call(tc, registry, ctx)
                events.append(ev)
                messages.append(_tool_message(tc, ev))
            continue

        # 没有更多工具调用 → 收集最终文本并退出
        final_text = msg.get("content") or ""
        return LoopResult(
            messages=messages,
            final_text=final_text,
            rounds=depth + 1,
            events=events,
            finish_reason=finish_reason or "stop",
        )

    # 达到深度上限,中止;让上层决定是否兜底
    logger.warning("tool loop hit max_depth=%d", max_depth)
    return LoopResult(
        messages=messages,
        final_text=final_text,
        rounds=max_depth,
        events=events,
        finish_reason="max_depth",
    )


# ──────────────── 内部工具 ──────────────────────────────────────────


def _assistant_with_tool_calls(msg: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "role": "assistant",
        "content": msg.get("content") or "",
        "tool_calls": msg["tool_calls"],
    }
    return out


def _tool_message(tc: dict[str, Any], ev: ToolEvent) -> dict[str, Any]:
    payload: dict[str, Any]
    if ev.ok:
        payload = {"ok": True, "result": ev.result}
    else:
        payload = {"ok": False, "error": ev.error}
    return {
        "role": "tool",
        "tool_call_id": tc.get("id") or "",
        "name": tc.get("function", {}).get("name") or "",
        "content": json.dumps(payload, ensure_ascii=False),
    }


async def _execute_tool_call(
    tc: dict[str, Any], registry: ToolRegistry, ctx: ToolContext
) -> ToolEvent:
    fn = tc.get("function") or {}
    name = fn.get("name") or ""
    raw_args = fn.get("arguments") or "{}"
    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
    except json.JSONDecodeError as e:
        return ToolEvent(name=name, args={}, ok=False, error=f"bad args: {e}")
    tool: Tool | None = registry.get(name)
    if not tool:
        return ToolEvent(name=name, args=args, ok=False, error="tool not registered")
    try:
        result = await tool.handler(args, ctx)
        return ToolEvent(name=name, args=args, ok=True, result=result)
    except ToolError as e:
        return ToolEvent(name=name, args=args, ok=False, error=str(e))
    except Exception as e:  # noqa: BLE001
        logger.exception("tool %s failed", name)
        return ToolEvent(name=name, args=args, ok=False, error=str(e)[:300])
