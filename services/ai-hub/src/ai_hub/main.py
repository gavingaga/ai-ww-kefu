"""FastAPI 入口 — /v1/ai/infer (SSE)。

事件协议(消费方按 ``event`` 字段分发):
    {"event": "decision", "action": "...", "reason": "...", "hits": [...]}
    {"event": "token", "text": "增量"}
    {"event": "handoff", "reason": "...", "hits": [...]}     # action=handoff 时
    {"event": "done", "tokens_in": 0, "tokens_out": 0, "model": "..."}
    {"event": "error", "message": "..."}
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
from .llm_client import chat_stream
from .prompt import build_messages, render_system

logger = logging.getLogger(__name__)


class InferRequest(BaseModel):
    """ai-hub /v1/ai/infer 入参。"""

    session_id: str
    user_text: str
    history: list[dict[str, str]] = Field(default_factory=list)
    profile: dict[str, Any] = Field(default_factory=dict)
    live_context: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    tools: list[dict[str, Any]] | None = None
    profile_id: str = "openai_default"
    stream: bool = True


def create_app() -> FastAPI:
    app = FastAPI(title="ai-kefu ai-hub", version="0.1.0")

    llm_router_base = os.getenv("LLM_ROUTER_URL", "http://localhost:8090")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/ai/infer")
    async def infer(req: InferRequest) -> Any:
        decision = decide(req.user_text)

        async def gen() -> AsyncIterator[bytes]:
            yield _sse(
                {
                    "event": "decision",
                    "action": decision.action,
                    "reason": decision.reason,
                    "confidence": decision.confidence,
                    "hits": decision.hits,
                }
            )

            if decision.action == "handoff":
                yield _sse(
                    {
                        "event": "handoff",
                        "reason": decision.reason,
                        "hits": decision.hits,
                        "summary": "用户请求转人工或命中合规关键词,直接进入排队。",
                    }
                )
                yield _sse({"event": "done"})
                return

            # LLM_GENERAL — 拼 prompt → llm-router 流式
            sys_text = render_system(
                profile=req.profile,
                live_context=req.live_context,
                summary=req.summary,
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
                    tools=req.tools,
                ):
                    if chunk.get("event") == "done":
                        yield _sse({"event": "done", "tokens_out": tokens_out})
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
                yield _sse({"event": "done", "tokens_out": tokens_out})
            except Exception as e:  # noqa: BLE001
                logger.exception("ai-hub infer failed")
                yield _sse({"event": "error", "message": str(e)[:300]})

        return StreamingResponse(gen(), media_type="text/event-stream")

    return app


def _sse(obj: dict[str, Any]) -> bytes:
    return ("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode()


app = create_app()


def main() -> None:
    import uvicorn

    port = int(os.getenv("AI_HUB_PORT", "8091"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")  # noqa: S104


if __name__ == "__main__":
    main()
