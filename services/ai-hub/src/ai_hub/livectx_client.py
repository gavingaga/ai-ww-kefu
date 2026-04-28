"""ai-hub → livectx-svc 客户端。

调用 livectx-svc ``GET /v1/live/context`` 拉服务端权威拼合后的 LiveContext。
失败 / 超时一律返回 ``None``,不阻塞 /v1/ai/infer 的主链路。
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class LivectxClient:
    def __init__(self, base_url: str, timeout_s: float = 1.5):
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.timeout_s = timeout_s

    async def resolve(
        self,
        *,
        scene: str | None,
        room_id: int | None = None,
        vod_id: int | None = None,
        uid: int | None = None,
    ) -> dict[str, Any] | None:
        if not self.base_url or not scene:
            return None
        params: dict[str, Any] = {"scene": scene}
        if room_id is not None:
            params["room_id"] = room_id
        if vod_id is not None:
            params["vod_id"] = vod_id
        if uid is not None:
            params["uid"] = uid
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as cli:
                resp = await cli.get(self.base_url + "/v1/live/context", params=params)
                if resp.status_code != 200:
                    return None
                return resp.json()
        except Exception as e:  # noqa: BLE001
            logger.debug("livectx resolve failed: %s", e)
            return None
