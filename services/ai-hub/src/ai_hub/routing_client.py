"""ai-hub → routing-svc 客户端 — 转人工时把 packet 投到队列。"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class RoutingClient:
    def __init__(self, base_url: str, timeout_s: float = 2.0):
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.timeout_s = timeout_s

    async def enqueue(
        self,
        *,
        session_id: str,
        tenant_id: int,
        skill_group: str | None,
        packet: dict[str, Any],
    ) -> dict[str, Any] | None:
        """投递 packet 到 routing-svc;失败仅打日志,不抛(handoff 不应被阻塞)。"""
        if not self.base_url:
            return None
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as cli:
                resp = await cli.post(
                    self.base_url + "/v1/queue/enqueue",
                    json={
                        "sessionId": session_id,
                        "tenantId": tenant_id,
                        "skillGroup": skill_group,
                        "packet": packet,
                    },
                )
                if resp.status_code // 100 != 2:
                    logger.warning(
                        "routing-svc enqueue %d: %s", resp.status_code, resp.text[:200]
                    )
                    return None
                return resp.json()
        except Exception as e:  # noqa: BLE001
            logger.warning("routing-svc enqueue failed: %s", e)
            return None
