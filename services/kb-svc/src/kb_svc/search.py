"""Hybrid 检索:vector + BM25 → RRF 融合 → reranker → top_k。

详见 PRD 03 §2.4 RAG。
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .embed import Embedder
from .models import Hit
from .rerank import lexical_rerank_score
from .store import ChunkStore


@dataclass
class SearchOpts:
    kb_id: str | None = None
    top_k: int = 5
    """最终返回条数。"""
    vector_top: int = 50
    bm25_top: int = 50
    rrf_k: int = 60
    """RRF 平滑常数(论文默认 60)。"""
    rerank_top: int = 20
    """送入 reranker 的候选数。"""


def reciprocal_rank_fusion(
    *ranked_lists: list[tuple[int, float]],
    k: int = 60,
) -> dict[int, float]:
    """对多路排序结果做 RRF;返回 idx → 累计 RRF 分。"""
    out: dict[int, float] = defaultdict(float)
    for ranked in ranked_lists:
        for rank, (idx, _score) in enumerate(ranked):
            out[idx] += 1.0 / (k + rank + 1)
    return out


async def hybrid_search(
    *,
    store: ChunkStore,
    embedder: Embedder,
    query: str,
    opts: SearchOpts | None = None,
) -> list[Hit]:
    if not query.strip() or store.size() == 0:
        return []
    o = opts or SearchOpts()
    candidates_idx = store.by_kb(o.kb_id) if o.kb_id else None

    # 1) 向量召回
    query_vec = (await embedder.embed([query]))[0] if embedder.dim > 0 else []
    vec_ranked = store.vector_search(query_vec, candidates_idx, top_k=o.vector_top) if query_vec else []

    # 2) BM25 召回(对 candidate 过滤一遍)
    bm25_ranked = store.bm25_search(query, top_k=o.bm25_top)
    if candidates_idx is not None:
        allowed = set(candidates_idx)
        bm25_ranked = [(i, s) for i, s in bm25_ranked if i in allowed]

    # 3) RRF 融合
    fused = reciprocal_rank_fusion(vec_ranked, bm25_ranked, k=o.rrf_k)
    if not fused:
        return []
    fused_ranked = sorted(fused.items(), key=lambda x: x[1], reverse=True)[: o.rerank_top]

    # 4) Reranker(轻量重叠)— 与 RRF 分按 0.6/0.4 加权
    vec_map = dict(vec_ranked)
    bm25_map = dict(bm25_ranked)
    hits: list[Hit] = []
    for rank0, (idx, rrf_score) in enumerate(fused_ranked):
        c = store.chunks[idx]
        rerank = lexical_rerank_score(query, c.title + " " + c.content)
        final = 0.6 * rrf_score + 0.4 * rerank
        hits.append(
            Hit(
                chunk=c,
                score=final,
                vector_score=float(vec_map.get(idx, 0.0)),
                bm25_score=float(bm25_map.get(idx, 0.0)),
                rerank_score=rerank,
                rank=rank0 + 1,
            )
        )
    hits.sort(key=lambda h: h.score, reverse=True)
    out = hits[: o.top_k]
    for r, h in enumerate(out, 1):
        h.rank = r
    return out


async def hybrid_search_debug(
    *,
    store: ChunkStore,
    embedder: Embedder,
    query: str,
    opts: SearchOpts | None = None,
) -> dict[str, Any]:
    """与 hybrid_search 同流程,但返回每路的原始排名 + 融合中间状态,便于运维调参。

    返回:
        {
            "query": str, "opts": {...},
            "store_size": int,
            "vector": [{chunk_id,title,score,rank}],
            "bm25":   [{chunk_id,title,score,rank}],
            "rrf":    [{chunk_id,title,rrf_score,rank}],
            "rerank": [{chunk_id,title,rerank_score,vector_score,bm25_score,
                        rrf_score,final_score,rank}],
            "hits":   [Hit.to_payload(),...],
        }
    """
    o = opts or SearchOpts()
    payload: dict[str, Any] = {
        "query": query,
        "opts": {
            "kb_id": o.kb_id,
            "top_k": o.top_k,
            "vector_top": o.vector_top,
            "bm25_top": o.bm25_top,
            "rrf_k": o.rrf_k,
            "rerank_top": o.rerank_top,
        },
        "store_size": store.size(),
        "vector": [],
        "bm25": [],
        "rrf": [],
        "rerank": [],
        "hits": [],
    }
    if not query.strip() or store.size() == 0:
        return payload

    candidates_idx = store.by_kb(o.kb_id) if o.kb_id else None

    query_vec = (await embedder.embed([query]))[0] if embedder.dim > 0 else []
    vec_ranked = (
        store.vector_search(query_vec, candidates_idx, top_k=o.vector_top) if query_vec else []
    )
    bm25_ranked = store.bm25_search(query, top_k=o.bm25_top)
    if candidates_idx is not None:
        allowed = set(candidates_idx)
        bm25_ranked = [(i, s) for i, s in bm25_ranked if i in allowed]

    payload["vector"] = [
        _ref(store, idx, rank, score=score, key="score") for rank, (idx, score) in enumerate(vec_ranked, 1)
    ]
    payload["bm25"] = [
        _ref(store, idx, rank, score=score, key="score")
        for rank, (idx, score) in enumerate(bm25_ranked, 1)
    ]

    fused = reciprocal_rank_fusion(vec_ranked, bm25_ranked, k=o.rrf_k)
    fused_ranked = sorted(fused.items(), key=lambda x: x[1], reverse=True)[: o.rerank_top]
    payload["rrf"] = [
        _ref(store, idx, rank, score=score, key="rrf_score")
        for rank, (idx, score) in enumerate(fused_ranked, 1)
    ]

    vec_map = dict(vec_ranked)
    bm25_map = dict(bm25_ranked)
    detail: list[dict[str, Any]] = []
    hits: list[Hit] = []
    for rank0, (idx, rrf_score) in enumerate(fused_ranked):
        c = store.chunks[idx]
        rerank = lexical_rerank_score(query, c.title + " " + c.content)
        final = 0.6 * rrf_score + 0.4 * rerank
        h = Hit(
            chunk=c,
            score=final,
            vector_score=float(vec_map.get(idx, 0.0)),
            bm25_score=float(bm25_map.get(idx, 0.0)),
            rerank_score=rerank,
            rank=rank0 + 1,
        )
        hits.append(h)
        detail.append(
            {
                "chunk_id": c.id,
                "title": c.title,
                "vector_score": round(h.vector_score, 4),
                "bm25_score": round(h.bm25_score, 4),
                "rrf_score": round(rrf_score, 4),
                "rerank_score": round(rerank, 4),
                "final_score": round(final, 4),
                "rank": rank0 + 1,
            }
        )
    detail.sort(key=lambda d: d["final_score"], reverse=True)
    for r, d in enumerate(detail, 1):
        d["rank"] = r
    payload["rerank"] = detail

    hits.sort(key=lambda h: h.score, reverse=True)
    final_hits = hits[: o.top_k]
    for r, h in enumerate(final_hits, 1):
        h.rank = r
    payload["hits"] = [h.to_payload() for h in final_hits]
    return payload


def _ref(
    store: ChunkStore, idx: int, rank: int, *, score: float, key: str
) -> dict[str, Any]:
    c = store.chunks[idx]
    return {
        "chunk_id": c.id,
        "doc_id": c.doc_id,
        "title": c.title,
        key: round(float(score), 4),
        "rank": rank,
    }
