"""kb-svc FastAPI 入口。

端点:
    GET /healthz
    POST /v1/kb/ingest          — 写入一篇文档(body) → 切片 + 嵌入 + 入库
    POST /v1/kb/search          — Hybrid 检索(返回每路分数 + 最终命中,供调试)
    POST /v1/kb/match           — 简化版 RAG 查询 — 返回顶部 chunks 拼接给 ai-hub
    GET  /v1/kb/stats           — 库内 chunk 数 / 维度
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .embed import Embedder, get_embedder
from .ingest import ingest_document
from .models import Document
from .search import SearchOpts, hybrid_search, hybrid_search_debug
from .seed_loader import load_default_seeds
from .store import ChunkStore

logger = logging.getLogger(__name__)


class IngestRequest(BaseModel):
    id: str
    kb_id: str = "default"
    title: str
    body: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchRequest(BaseModel):
    query: str
    kb_id: str | None = None
    top_k: int = 5
    debug: bool = False


class DebugSearchRequest(BaseModel):
    query: str
    kb_id: str | None = None
    top_k: int = 5
    vector_top: int = 50
    bm25_top: int = 50
    rrf_k: int = 60
    rerank_top: int = 20


def create_app(
    *,
    store: ChunkStore | None = None,
    embedder: Embedder | None = None,
    auto_seed: bool | None = None,
) -> FastAPI:
    s = store if store is not None else ChunkStore()
    e = embedder if embedder is not None else get_embedder()
    do_seed = auto_seed if auto_seed is not None else (
        os.getenv("KB_AUTO_SEED", "1").lower() in {"1", "true", "yes"}
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if do_seed:
            try:
                await load_default_seeds(s, e)
            except Exception:  # noqa: BLE001
                logger.exception("seed load failed")
        yield

    app = FastAPI(title="ai-kefu kb-svc", version="0.1.0", lifespan=lifespan)
    app.state.store = s
    app.state.embedder = e

    @app.get("/healthz")
    async def healthz() -> dict[str, Any]:
        return {
            "status": "ok",
            "chunks": s.size(),
            "embedder": e.__class__.__name__,
            "dim": getattr(e, "dim", 0),
        }

    @app.get("/v1/kb/stats")
    async def stats() -> dict[str, Any]:
        kbs: dict[str, int] = {}
        for c in s.chunks:
            kbs[c.kb_id] = kbs.get(c.kb_id, 0) + 1
        return {
            "chunks": s.size(),
            "by_kb": kbs,
            "embedder": e.__class__.__name__,
            "dim": getattr(e, "dim", 0),
        }

    @app.get("/v1/kb/docs")
    async def list_docs() -> dict[str, Any]:
        return {"items": s.list_docs(), "total": len({c.doc_id for c in s.chunks})}

    @app.delete("/v1/kb/docs/{doc_id}")
    async def delete_doc(doc_id: str) -> dict[str, Any]:
        n = s.delete_by_doc(doc_id)
        if n == 0:
            raise HTTPException(404, "doc not found: " + doc_id)
        return {"ok": True, "doc_id": doc_id, "deleted_chunks": n}

    @app.post("/v1/kb/docs/{doc_id}/reindex")
    async def reindex_doc(doc_id: str) -> dict[str, Any]:
        idxs = s.by_doc(doc_id)
        if not idxs:
            raise HTTPException(404, "doc not found: " + doc_id)
        if e.dim <= 0:
            return {"ok": True, "doc_id": doc_id, "reindexed": 0, "note": "embedder dim=0"}
        texts = [s.chunks[i].title + "\n" + s.chunks[i].content for i in idxs]
        vecs = await e.embed(texts)
        for idx, v in zip(idxs, vecs, strict=False):
            s.replace_chunk_embedding(idx, v)
        return {"ok": True, "doc_id": doc_id, "reindexed": len(idxs)}

    @app.post("/v1/kb/ingest")
    async def ingest(req: IngestRequest) -> dict[str, Any]:
        doc = Document(
            id=req.id,
            kb_id=req.kb_id,
            title=req.title,
            body=req.body,
            metadata=req.metadata,
        )
        chunks = await ingest_document(doc=doc, store=s, embedder=e)
        return {"ok": True, "chunks": len(chunks), "doc_id": doc.id}

    @app.post("/v1/kb/search")
    async def search(req: SearchRequest) -> dict[str, Any]:
        if not req.query.strip():
            raise HTTPException(400, "query required")
        opts = SearchOpts(kb_id=req.kb_id, top_k=req.top_k)
        hits = await hybrid_search(store=s, embedder=e, query=req.query, opts=opts)
        return {
            "query": req.query,
            "hits": [h.to_payload() for h in hits],
        }

    @app.post("/v1/kb/debug/search")
    async def debug_search(req: DebugSearchRequest) -> dict[str, Any]:
        """检索调试 — 返回每路向量 / BM25 排名、RRF 分、Rerank 分与最终融合分。

        管理后台用于"为什么这条没命中 / 为什么这条排前面"的调参排查。
        """
        if not req.query.strip():
            raise HTTPException(400, "query required")
        opts = SearchOpts(
            kb_id=req.kb_id,
            top_k=req.top_k,
            vector_top=req.vector_top,
            bm25_top=req.bm25_top,
            rrf_k=req.rrf_k,
            rerank_top=req.rerank_top,
        )
        return await hybrid_search_debug(store=s, embedder=e, query=req.query, opts=opts)

    @app.post("/v1/kb/match")
    async def match(req: SearchRequest) -> dict[str, Any]:
        """供 ai-hub 直接消费的简化结构 — 已拼好 ``chunks`` 文本。"""
        if not req.query.strip():
            raise HTTPException(400, "query required")
        opts = SearchOpts(kb_id=req.kb_id, top_k=req.top_k)
        hits = await hybrid_search(store=s, embedder=e, query=req.query, opts=opts)
        if not hits:
            return {"hit": False, "score": 0.0, "chunks": [], "rendered": ""}
        top = hits[0]
        rendered = "\n\n".join(
            f"[{h.chunk.title}] {h.chunk.content}" for h in hits
        )
        return {
            "hit": True,
            "score": top.score,
            "top_title": top.chunk.title,
            "chunks": [h.to_payload() for h in hits],
            "rendered": rendered,
        }

    return app


app = create_app()


def main() -> None:
    import uvicorn

    port = int(os.getenv("KB_SVC_PORT", "8092"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")  # noqa: S104


if __name__ == "__main__":
    main()
