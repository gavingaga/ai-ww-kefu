"""Hybrid 检索:vector + BM25 → RRF 融合 → reranker → top_k。

详见 PRD 03 §2.4 RAG。
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

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
