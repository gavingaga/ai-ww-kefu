"""ai-hub → kb-svc 客户端。

调用 kb-svc 的 ``POST /v1/kb/match`` 简化接口,失败返回 None,不阻塞决策器。
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class KbClient:
    def __init__(self, base_url: str, timeout_s: float = 2.5):
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.timeout_s = timeout_s

    async def match(
        self, query: str, kb_id: str | None = None, top_k: int = 5
    ) -> dict[str, Any] | None:
        if not self.base_url or not query:
            return None
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as cli:
                resp = await cli.post(
                    self.base_url + "/v1/kb/match",
                    json={"query": query, "kb_id": kb_id, "top_k": top_k},
                )
                if resp.status_code != 200:
                    return None
                data = resp.json()
                return data if data.get("hit") else None
        except Exception as e:  # noqa: BLE001
            logger.debug("kb_client match failed: %s", e)
            return None
