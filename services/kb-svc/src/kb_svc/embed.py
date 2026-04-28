"""嵌入器 — 默认走 ``hash``(纯本地 mock),可切到 ``llm-router /v1/embeddings``。

设计目的是让 kb-svc 在没有 OpenAI key / 没有 llm-router 的离线环境下,
仍能跑通切片 → 嵌入 → 检索的全链路单测。

切换:
    KB_EMBED_PROVIDER=llm   且 LLM_ROUTER_URL 可达     → 调真嵌入
    KB_EMBED_PROVIDER=hash(默认)                    → 走本地 hash 嵌入(384 维)
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import os
from typing import Protocol

import httpx

from .tokenize import tokenize

logger = logging.getLogger(__name__)

DIM_HASH = 384


class Embedder(Protocol):
    dim: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class HashEmbedder:
    """token → 多组 SHA1 → 散列到向量分量;同义/相同 token 映射到一致维度。

    仅适合开发/单测;真实质量由 llm-router 嵌入提供。
    """

    def __init__(self, dim: int = DIM_HASH) -> None:
        self.dim = dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        tokens = tokenize(text)
        vec = [0.0] * self.dim
        if not tokens:
            return vec
        for tok in tokens:
            h = hashlib.sha1(tok.encode("utf-8")).digest()
            # 用 sha1 的前 8 字节做两个分量,后 8 字节做两个,共 4 路碰撞降低,质量更稳
            for off in (0, 8):
                idx = int.from_bytes(h[off : off + 4], "little") % self.dim
                sign = 1.0 if h[off + 4] & 1 else -1.0
                weight = (h[off + 5] / 255.0) + 0.5  # 0.5..1.5
                vec[idx] += sign * weight
        return _l2_normalize(vec)


class LLMRouterEmbedder:
    """通过 llm-router 调真嵌入(OpenAI 协议:``POST /v1/embeddings``)。"""

    def __init__(self, base_url: str, model: str = "text-embedding-3-large", dim: int = 3072):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.dim = dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        url = self.base_url + "/v1/embeddings"
        async with httpx.AsyncClient(timeout=15.0) as cli:
            resp = await cli.post(url, json={"model": self.model, "input": texts})
            if resp.status_code // 100 != 2:
                raise RuntimeError(f"embed {resp.status_code}: {resp.text[:200]}")
            data = resp.json()
        return [item["embedding"] for item in data.get("data", [])]


def get_embedder() -> Embedder:
    provider = os.getenv("KB_EMBED_PROVIDER", "hash").lower()
    if provider == "llm":
        base = os.getenv("LLM_ROUTER_URL", "http://localhost:8090")
        model = os.getenv("KB_EMBED_MODEL", "text-embedding-3-large")
        dim = int(os.getenv("KB_EMBED_DIM", "3072"))
        return LLMRouterEmbedder(base, model, dim)
    return HashEmbedder()


def _l2_normalize(v: list[float]) -> list[float]:
    s = math.sqrt(sum(x * x for x in v))
    if s == 0:
        return v
    return [x / s for x in v]


# 同步辅助:在非 async 上下文里偶尔需要(单测)
def embed_blocking(embedder: Embedder, texts: list[str]) -> list[list[float]]:
    return asyncio.get_event_loop().run_until_complete(embedder.embed(texts))
