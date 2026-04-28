"""FastAPI 入口 — /v1/ai/infer (SSE)。

事件协议(消费方按 ``event`` 字段分发):
    {"event": "decision", "action": "...", "reason": "...", "hits": [...]}
    {"event": "token", "text": "增量"}
    {"event": "faq", "node_id": "...", "title": "...", "answer": {...}, "score": 0.93, "how": "exact|similar"}
    {"event": "handoff", "reason": "...", "hits": [...]}
    {"event": "done", "tokens_in": 0, "tokens_out": 0, "model": "..."}
    {"event": "error", "message": "..."}

决策路径(详见 PRD 03 §2.2):
    HANDOFF(关键词)→ FAQ(精确 / 相似)→ LLM_GENERAL → 兜底(error)
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .decision import decide
from .faq_client import FaqClient
from .handoff import HandoffReason, build_handoff_packet
from .llm_client import chat_once_full, chat_stream
from .prompt import build_messages, render_with_meta
from .routing_client import RoutingClient
from .tool_loop import run_tool_loop
from .tools import ToolRegistry, default_registry
from .tools.registry import ToolContext

logger = logging.getLogger(__name__)


class InferRequest(BaseModel):
    """ai-hub /v1/ai/infer 入参。"""

    session_id: str
    user_text: str
    history: list[dict[str, str]] = Field(default_factory=list)
    profile: dict[str, Any] = Field(default_factory=dict)
    live_context: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    tools: list[str] | None = None
    """允许 LLM 选用的工具名白名单。为空则不启用工具循环;``[]`` 显式禁用。"""
    profile_id: str = "openai_default"
    stream: bool = True
    prompt_version: int | None = None
    """显式指定 prompt 模板版本(同 scene 下);为空取最高版本。"""
    dry_run: bool = True
    """写操作工具是否走 dry_run。默认 true;由用户/坐席二次确认后由 BFF 改 false 重跑。"""


def create_app(
    *,
    faq_client: FaqClient | None = None,
    tool_registry: ToolRegistry | None = None,
    routing_client: RoutingClient | None = None,
) -> FastAPI:
    app = FastAPI(title="ai-kefu ai-hub", version="0.4.0")

    llm_router_base = os.getenv("LLM_ROUTER_URL", "http://localhost:8090")
    notify_base = os.getenv("NOTIFY_SVC_URL", "http://localhost:8082")
    routing_base = os.getenv("ROUTING_SVC_URL", "http://localhost:8083")
    fc = faq_client if faq_client is not None else FaqClient(notify_base)
    rc = routing_client if routing_client is not None else RoutingClient(routing_base)
    tools = tool_registry if tool_registry is not None else default_registry()
    max_tool_depth = int(os.getenv("AI_HUB_TOOL_MAX_DEPTH", "3"))

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/ai/infer")
    async def infer(req: InferRequest) -> Any:
        decision = decide(req.user_text)

        async def gen() -> AsyncIterator[bytes]:
            # ① 强制规则 → handoff(优先级最高,绕过 FAQ / LLM)
            if decision.action == "handoff":
                yield _sse(_decision_event(decision))
                packet = await _build_packet_for_handoff(
                    req, decision.reason, decision.hits, llm_router_base
                )
                # 主动投到 routing-svc 队列(失败仅日志,不阻塞 SSE)
                enq = await rc.enqueue(
                    session_id=req.session_id,
                    tenant_id=int(req.profile.get("tenant_id", 1)),
                    skill_group=packet.skill_group_hint,
                    packet=packet.to_dict(),
                )
                queue_entry_id = (enq or {}).get("id")
                yield _sse({"event": "handoff_packet", **packet.to_dict()})
                yield _sse(
                    {
                        "event": "handoff",
                        "reason": decision.reason,
                        "hits": decision.hits,
                        "summary": packet.summary,
                        "skill_group_hint": packet.skill_group_hint,
                        "queue_entry_id": queue_entry_id,
                        "enqueued": enq is not None,
                    }
                )
                yield _sse({"event": "done"})
                return

            # ② FAQ 精确 / 相似匹配(零 token)
            try:
                hit = await fc.match(req.user_text)
            except Exception as e:  # noqa: BLE001
                logger.warning("ai-hub: faq match failed, fallback to LLM: %s", e)
                hit = None

            if hit:
                node_id = hit.get("node_id", "")
                yield _sse(
                    {
                        "event": "decision",
                        "action": "faq",
                        "reason": "faq_" + str(hit.get("how") or "exact"),
                        "confidence": float(hit.get("score") or 1.0),
                        "hits": [node_id] if node_id else [],
                    }
                )
                yield _sse(
                    {
                        "event": "faq",
                        "node_id": node_id,
                        "title": hit.get("title"),
                        "answer": hit.get("answer"),
                        "score": float(hit.get("score") or 1.0),
                        "how": hit.get("how") or "exact",
                    }
                )
                # 命中埋点(忽略失败)
                if node_id:
                    try:
                        await fc.hit(node_id)
                    except Exception:  # noqa: BLE001
                        logger.debug("faq hit log failed", exc_info=True)
                yield _sse({"event": "done", "tokens_out": 0})
                return

            # ③ LLM_GENERAL — 可选 ToolLoop → 最终流式
            yield _sse(_decision_event(decision))

            tool_results_summary: dict[str, Any] = {}
            tool_events_log: list[dict[str, Any]] = []

            # 工具循环(仅当 tools 白名单非 None;空列表 = 显式禁用)
            if req.tools:
                # 先用一份"无工具结果"的 system 渲染做循环底盘
                sys_text_first, _ = render_with_meta(
                    profile=req.profile,
                    live_context=req.live_context,
                    summary=req.summary,
                    version=req.prompt_version,
                )
                base_messages = build_messages(
                    user_text=req.user_text,
                    history=req.history,
                    system_text=sys_text_first,
                )

                async def _llm_call(
                    msgs: list[dict[str, Any]], tools_schema: list[dict[str, Any]] | None
                ) -> dict[str, Any]:
                    return await chat_once_full(
                        base_url=llm_router_base,
                        profile_id=req.profile_id,
                        messages=msgs,
                        tools=tools_schema,
                    )

                ctx = ToolContext(
                    session_id=req.session_id,
                    user_profile=req.profile,
                    live_context=req.live_context,
                    dry_run=req.dry_run,
                )
                try:
                    loop = await run_tool_loop(
                        llm_call=_llm_call,
                        registry=tools,
                        base_messages=base_messages,
                        ctx=ctx,
                        tool_names=req.tools,
                        max_depth=max_tool_depth,
                    )
                except Exception as e:  # noqa: BLE001
                    logger.exception("tool loop failed")
                    yield _sse({"event": "error", "message": f"tool loop: {str(e)[:300]}"})
                    return

                for ev in loop.events:
                    rec = {
                        "event": "tool_call",
                        "name": ev.name,
                        "args": ev.args,
                        "ok": ev.ok,
                        "error": ev.error,
                        "result": ev.result if ev.ok else None,
                    }
                    yield _sse(rec)
                    tool_events_log.append(rec)

                tool_results_summary = loop.tool_results_summary

                # 若循环已经给到最终文本(无 tool_calls 的最后一轮),直接以 token 形式推出
                if loop.final_text:
                    sys_text, tmpl = render_with_meta(
                        profile=req.profile,
                        live_context=req.live_context,
                        summary=req.summary,
                        tool_results=tool_results_summary,
                        version=req.prompt_version,
                    )
                    yield _sse(
                        {
                            "event": "prompt_template",
                            "id": tmpl.id,
                            "scene": tmpl.scene,
                            "version": tmpl.version,
                            "title": tmpl.title,
                        }
                    )
                    yield _sse({"event": "token", "text": loop.final_text})
                    yield _sse(
                        {
                            "event": "done",
                            "tokens_out": len(loop.final_text),
                            "prompt": tmpl.id,
                            "tool_rounds": loop.rounds,
                        }
                    )
                    return

            # 默认路径(或 ToolLoop 没产出最终文本):重新拼 prompt + 流式输出
            sys_text, tmpl = render_with_meta(
                profile=req.profile,
                live_context=req.live_context,
                summary=req.summary,
                tool_results=tool_results_summary,
                version=req.prompt_version,
            )
            yield _sse(
                {
                    "event": "prompt_template",
                    "id": tmpl.id,
                    "scene": tmpl.scene,
                    "version": tmpl.version,
                    "title": tmpl.title,
                }
            )
            messages = build_messages(
                user_text=req.user_text,
                history=req.history,
                system_text=sys_text,
            )
            try:
                tokens_out = 0
                async for chunk in chat_stream(
                    base_url=llm_router_base,
                    profile_id=req.profile_id,
                    messages=messages,
                    tools=None,  # 工具已在 ToolLoop 阶段处理完;最终流式不再带 tools
                ):
                    if chunk.get("event") == "done":
                        yield _sse(
                            {
                                "event": "done",
                                "tokens_out": tokens_out,
                                "prompt": tmpl.id,
                                "tool_rounds": len(tool_events_log),
                            }
                        )
                        return
                    if "error" in chunk:
                        yield _sse({"event": "error", "message": str(chunk["error"])[:300]})
                        return
                    delta = (
                        chunk.get("choices", [{}])[0].get("delta", {}).get("content") or ""
                    )
                    if delta:
                        tokens_out += len(delta)
                        yield _sse({"event": "token", "text": delta})
                yield _sse(
                    {
                        "event": "done",
                        "tokens_out": tokens_out,
                        "prompt": tmpl.id,
                        "tool_rounds": len(tool_events_log),
                    }
                )
            except Exception as e:  # noqa: BLE001
                logger.exception("ai-hub infer failed")
                yield _sse({"event": "error", "message": str(e)[:300]})

        return StreamingResponse(gen(), media_type="text/event-stream")

    return app


def _normalize_handoff_reason(raw: str, hits: list[str]) -> HandoffReason:
    """决策器 reason → HandoffReason 枚举(细化未成年/举报)。"""
    if any("未成年" in h for h in hits or []):
        return "minor_compliance"
    if any(h in {"举报", "版权"} for h in hits or []):
        return "report_compliance"
    if raw == "rule_keyword":
        return "rule_keyword"
    if raw == "user_request":
        return "user_request"
    return "rule_keyword"


async def _build_packet_for_handoff(
    req: "InferRequest",
    raw_reason: str,
    hits: list[str],
    llm_router_base: str,
):
    reason = _normalize_handoff_reason(raw_reason, hits)

    async def _llm_text(messages: list[dict[str, Any]]) -> str:
        data = await chat_once_full(
            base_url=llm_router_base,
            profile_id=req.profile_id,
            messages=messages,
        )
        return (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""

    return await build_handoff_packet(
        session_id=req.session_id,
        reason=reason,
        user_text=req.user_text,
        history=req.history,
        profile=req.profile,
        live_context=req.live_context,
        llm_call=_llm_text,
    )


def _decision_event(decision) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    return {
        "event": "decision",
        "action": decision.action,
        "reason": decision.reason,
        "confidence": decision.confidence,
        "hits": decision.hits,
    }


def _sse(obj: dict[str, Any]) -> bytes:
    return ("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode()


app = create_app()


def main() -> None:
    import uvicorn

    port = int(os.getenv("AI_HUB_PORT", "8091"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")  # noqa: S104


if __name__ == "__main__":
    main()
