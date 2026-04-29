"""FastAPI 服务入口。

对外暴露三类端点:
- 透传 ``POST /v1/chat/completions``:OpenAI 协议(stream=true 走 SSE)。
  路由档位通过自定义 header ``X-Profile-Id`` 指定;缺省走 ``openai_default``。
- 健康 / 档位查询:``/healthz`` / ``/v1/profiles`` / ``/v1/profiles/{id}/health``
- 试聊:``POST /v1/profiles/{id}/test``
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from .health import HealthTracker
from .openai_adapter import LLMError
from .profiles import ProfileRegistry
from .quota import QuotaManager
from .router import Router

logger = logging.getLogger(__name__)


def create_app(registry: ProfileRegistry | None = None) -> FastAPI:
    app = FastAPI(title="ai-kefu llm-router", version="0.1.0")

    reg = registry or ProfileRegistry.from_env()
    health = HealthTracker()
    router = Router(reg, health)
    quota = QuotaManager(reg)

    app.state.registry = reg
    app.state.router = router
    app.state.health = health
    app.state.quota = quota

    @app.get("/v1/profiles/{pid}/quota")
    async def profile_quota(pid: str) -> dict[str, Any]:
        if not reg.get(pid):
            raise HTTPException(404, "profile not found")
        return quota.snapshot(pid)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/profiles")
    async def list_profiles() -> list[dict[str, Any]]:
        return [p.safe_dict() for p in reg.all()]

    @app.get("/v1/profiles/{pid}/health")
    async def profile_health(pid: str) -> dict[str, Any]:
        if not reg.get(pid):
            raise HTTPException(404, "profile not found")
        return health.snapshot(pid)

    class TestRequest(BaseModel):
        prompt: str = "你好,请用一句话自我介绍。"

    @app.post("/v1/profiles/{pid}/test")
    async def test_profile(pid: str, body: TestRequest) -> dict[str, Any]:
        if not reg.get(pid):
            raise HTTPException(404, "profile not found")
        try:
            text = await router.once(pid, [{"role": "user", "content": body.prompt}])
            return {"ok": True, "sample": text}
        except LLMError as e:
            return {"ok": False, "status": e.status, "error": e.body[:500]}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)[:500]}

    @app.post("/v1/chat/completions")
    async def chat_completions(
        body: dict[str, Any],
        x_profile_id: str | None = Header(default=None),
    ) -> Any:
        profile_id = x_profile_id or "openai_default"
        if not reg.get(profile_id):
            raise HTTPException(404, f"profile not found: {profile_id}")
        messages = body.get("messages", [])
        tools = body.get("tools")
        stream = bool(body.get("stream"))
        extra: dict[str, Any] = {k: v for k, v in body.items() if k not in {"messages", "tools", "stream"}}
        # 限速 / 预算 — 用消息长度估算入参 token(粗略 4 字符/ token)
        est_in = sum(len(str(m.get("content") or "")) for m in messages) // 4 + 1
        ok, reason, used_pct = await quota.check_and_reserve(profile_id, est_in)
        if not ok:
            status_code = 503 if "budget" in reason else 429
            return JSONResponse(
                {"error": {"code": "rate_limited", "message": reason}},
                status_code=status_code,
                headers={"X-Budget-Used-Pct": f"{used_pct:.4f}"},
            )

        if not stream:
            data = await router.once_full(profile_id, messages, tools=tools, extra_params=extra)
            usage = data.get("usage") or {}
            in_t = int(usage.get("prompt_tokens") or est_in)
            out_t = int(usage.get("completion_tokens") or 0)
            new_pct = await quota.record(profile_id, in_t, out_t, est_in_tokens_already_reserved=est_in)
            return JSONResponse(data, headers={"X-Budget-Used-Pct": f"{new_pct:.4f}"})

        async def gen() -> AsyncIterator[bytes]:
            try:
                async for chunk in router.stream(profile_id, messages, tools, extra):
                    yield ("data: " + json.dumps(chunk, ensure_ascii=False) + "\n\n").encode()
                yield b"data: [DONE]\n\n"
            except LLMError as e:
                err = json.dumps({"error": {"status": e.status, "body": e.body[:500]}})
                yield ("data: " + err + "\n\n").encode()
            except Exception as e:  # noqa: BLE001
                err = json.dumps({"error": {"message": str(e)[:500]}})
                yield ("data: " + err + "\n\n").encode()

        return StreamingResponse(gen(), media_type="text/event-stream")

    return app


# uvicorn 入口
app = create_app()


def main() -> None:
    import uvicorn

    port = int(os.getenv("LLM_ROUTER_PORT", "8090"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")  # noqa: S104


if __name__ == "__main__":
    main()
