"""ToolLoop 单测 — 注入 stub LLM 与 stub Tool,不依赖网络。"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from ai_hub.tool_loop import run_tool_loop
from ai_hub.tools.registry import (
    Tool,
    ToolContext,
    ToolError,
    ToolRegistry,
    default_registry,
)


def _make_llm(
    sequence: list[dict[str, Any]],
) -> tuple[Callable[..., Awaitable[dict[str, Any]]], list[dict[str, Any]]]:
    """返回一个按 sequence 顺序逐次返回响应的 stub LLM。

    sequence 中每项是 OpenAI choice[0].message,可含 tool_calls 或 content。
    """
    captures: list[dict[str, Any]] = []

    async def call(
        msgs: list[dict[str, Any]], tools_schema: list[dict[str, Any]] | None
    ) -> dict[str, Any]:
        idx = len(captures)
        captures.append({"msgs": [m for m in msgs], "tools": tools_schema})
        msg = sequence[min(idx, len(sequence) - 1)]
        if "tool_calls" in msg:
            return {"choices": [{"message": msg, "finish_reason": "tool_calls"}]}
        return {"choices": [{"message": msg, "finish_reason": "stop"}]}

    return call, captures


def _tool_call(idx: int, name: str, args: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"call_{idx}",
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }


@pytest.mark.asyncio
async def test_default_registry_has_play_diagnostics():
    reg = default_registry()
    t = reg.get("get_play_diagnostics")
    assert t is not None
    assert t.write is False
    schema = reg.to_openai(["get_play_diagnostics"])
    assert schema and schema[0]["function"]["name"] == "get_play_diagnostics"


@pytest.mark.asyncio
async def test_loop_terminates_with_no_tool_calls():
    llm, captures = _make_llm([{"role": "assistant", "content": "你好"}])
    res = await run_tool_loop(
        llm_call=llm,
        registry=default_registry(),
        base_messages=[{"role": "user", "content": "嗨"}],
        ctx=ToolContext(session_id="s"),
        tool_names=["get_play_diagnostics"],
        max_depth=3,
    )
    assert res.rounds == 1
    assert res.final_text == "你好"
    assert res.events == []
    assert len(captures) == 1
    assert captures[0]["tools"] is not None  # tool schema 已传


@pytest.mark.asyncio
async def test_loop_executes_tool_then_returns_text():
    """LLM 第一轮请求 get_play_diagnostics,第二轮总结。"""
    llm, captures = _make_llm(
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [_tool_call(1, "get_play_diagnostics", {"room_id": 8001})],
            },
            {"role": "assistant", "content": "建议切到 480p"},
        ]
    )
    ctx = ToolContext(
        session_id="s",
        live_context={
            "play": {"buffer_events_60s": 8, "cdn_node": "sh-3"},
            "network": {"downlink_mbps": 1.0},
        },
    )
    res = await run_tool_loop(
        llm_call=llm,
        registry=default_registry(),
        base_messages=[{"role": "user", "content": "卡顿"}],
        ctx=ctx,
        tool_names=["get_play_diagnostics"],
        max_depth=3,
    )
    assert res.rounds == 2
    assert res.final_text == "建议切到 480p"
    assert len(res.events) == 1
    ev = res.events[0]
    assert ev.ok and ev.name == "get_play_diagnostics"
    assert ev.result["verdict"] == "local_network"
    # 第二次调用时 messages 已包含 assistant(tool_calls) + tool 结果
    second = captures[1]["msgs"]
    roles = [m["role"] for m in second]
    assert "assistant" in roles and "tool" in roles


@pytest.mark.asyncio
async def test_dry_run_for_write_tool():
    """cancel_subscription 为写操作,默认 dry_run。"""
    llm, _ = _make_llm(
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    _tool_call(1, "cancel_subscription", {"uid": 100, "sub_id": "sub_1"})
                ],
            },
            {"role": "assistant", "content": "已模拟取消,等待你确认"},
        ]
    )
    ctx = ToolContext(session_id="s", dry_run=True)
    res = await run_tool_loop(
        llm_call=llm,
        registry=default_registry(),
        base_messages=[{"role": "user", "content": "我要取消订阅"}],
        ctx=ctx,
        tool_names=["cancel_subscription"],
    )
    assert res.events[0].result["dry_run"] is True


@pytest.mark.asyncio
async def test_unregistered_tool_returns_error_to_llm():
    llm, _ = _make_llm(
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [_tool_call(1, "ghost_tool", {})],
            },
            {"role": "assistant", "content": "无法执行"},
        ]
    )
    res = await run_tool_loop(
        llm_call=llm,
        registry=default_registry(),
        base_messages=[{"role": "user", "content": "x"}],
        ctx=ToolContext(),
        tool_names=["ghost_tool"],
    )
    ev = res.events[0]
    assert not ev.ok
    assert "not registered" in ev.error


@pytest.mark.asyncio
async def test_max_depth_breaks_runaway_loop():
    """LLM 持续要求工具调用 → 达到 max_depth 截断。"""
    sequence = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [_tool_call(i, "get_play_diagnostics", {})],
        }
        for i in range(10)
    ]
    llm, _ = _make_llm(sequence)
    res = await run_tool_loop(
        llm_call=llm,
        registry=default_registry(),
        base_messages=[{"role": "user", "content": "x"}],
        ctx=ToolContext(),
        tool_names=["get_play_diagnostics"],
        max_depth=2,
    )
    assert res.rounds == 2
    assert res.finish_reason == "max_depth"
    assert len(res.events) == 2


@pytest.mark.asyncio
async def test_tool_handler_exception_translated_to_event():
    reg = ToolRegistry()

    async def boom(_a, _c):  # type: ignore[no-untyped-def]
        raise ToolError("boom")

    reg.register(
        Tool(name="boom", description="d", parameters={"type": "object"}, handler=boom)
    )

    llm, _ = _make_llm(
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [_tool_call(1, "boom", {})],
            },
            {"role": "assistant", "content": "失败已知"},
        ]
    )
    res = await run_tool_loop(
        llm_call=llm,
        registry=reg,
        base_messages=[{"role": "user", "content": "x"}],
        ctx=ToolContext(),
        tool_names=["boom"],
    )
    ev = res.events[0]
    assert not ev.ok and ev.error == "boom"
    assert res.final_text == "失败已知"
