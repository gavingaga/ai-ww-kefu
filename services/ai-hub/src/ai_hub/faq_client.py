"""ai-hub → notify-svc FAQ 客户端。

优先尝试 ``POST /v1/faq/match``;notify-svc 不可达时返回 ``None``,由调用方
退化到 RAG / LLM 路径。
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class FaqClient:
    def __init__(self, base_url: str, timeout_s: float = 1.5):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    async def match(self, query: str) -> dict[str, Any] | None:
        if not self.base_url:
            return None
        url = self.base_url + "/v1/faq/match"
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as cli:
                resp = await cli.post(url, json={"query": query})
                if resp.status_code != 200:
                    return None
                data = resp.json()
                return data if data.get("hit") else None
        except Exception as e:  # noqa: BLE001
            logger.debug("faq_client match failed: %s", e)
            return None

    async def hit(self, node_id: str) -> None:
        if not self.base_url or not node_id:
            return
        url = self.base_url + "/v1/faq/hit"
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as cli:
                await cli.post(url, json={"node_id": node_id})
        except Exception as e:  # noqa: BLE001
            logger.debug("faq_client hit failed: %s", e)
