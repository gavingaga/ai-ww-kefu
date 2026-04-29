"""内存向量 + BM25 复合存储。

Chunk 的 embedding 在 add 时由调用方传入(从 Embedder 拿);M3 末迁移到 Milvus。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .bm25 import BM25Index
from .models import Chunk


@dataclass
class ChunkStore:
    chunks: list[Chunk] = field(default_factory=list)
    bm25: BM25Index = field(default_factory=BM25Index)

    def add(self, chunk: Chunk) -> int:
        idx = len(self.chunks)
        self.chunks.append(chunk)
        # BM25 用 title + content,提升题目命中能力
        self.bm25.add((chunk.title or "") + "\n" + chunk.content)
        return idx

    def size(self) -> int:
        return len(self.chunks)

    def by_kb(self, kb_id: str | None) -> list[int]:
        if not kb_id:
            return list(range(len(self.chunks)))
        return [i for i, c in enumerate(self.chunks) if c.kb_id == kb_id]

    def list_docs(self) -> list[dict]:
        """按 doc_id 聚合 — 返回 [{doc_id, kb_id, title, chunks}, ...]。"""
        agg: dict[str, dict] = {}
        for c in self.chunks:
            row = agg.setdefault(
                c.doc_id,
                {"doc_id": c.doc_id, "kb_id": c.kb_id, "title": c.title, "chunks": 0},
            )
            row["chunks"] += 1
        return sorted(agg.values(), key=lambda r: (r["kb_id"], r["doc_id"]))

    def by_doc(self, doc_id: str) -> list[int]:
        return [i for i, c in enumerate(self.chunks) if c.doc_id == doc_id]

    def delete_by_doc(self, doc_id: str) -> int:
        """删除某文档的所有 chunks,返回删除数。BM25 索引重建。"""
        removed = 0
        kept: list[Chunk] = []
        for c in self.chunks:
            if c.doc_id == doc_id:
                removed += 1
            else:
                kept.append(c)
        if removed == 0:
            return 0
        self.chunks = kept
        # 重建 BM25(chunk 顺序变了,索引必须重置)
        self.bm25 = BM25Index()
        for c in self.chunks:
            self.bm25.add((c.title or "") + "\n" + c.content)
        return removed

    def replace_chunk_embedding(self, idx: int, embedding: list[float]) -> None:
        if 0 <= idx < len(self.chunks):
            self.chunks[idx].embedding = embedding

    def vector_search(
        self,
        query_vec: list[float],
        candidate_idx: list[int] | None = None,
        top_k: int = 50,
    ) -> list[tuple[int, float]]:
        if not query_vec or not self.chunks:
            return []
        idx_list = candidate_idx if candidate_idx is not None else range(len(self.chunks))
        scored: list[tuple[int, float]] = []
        for i in idx_list:
            emb = self.chunks[i].embedding
            if not emb:
                continue
            scored.append((i, _cosine(query_vec, emb)))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    def bm25_search(self, query: str, top_k: int = 50) -> list[tuple[int, float]]:
        return self.bm25.search(query, top_k=top_k)


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    n = min(len(a), len(b))
    dot = 0.0
    for i in range(n):
        dot += a[i] * b[i]
    # 嵌入器内部已 L2 归一化(HashEmbedder);未归一化时退化但仍可用
    if any(abs(x) > 1.5 for x in a[:8]):
        # 粗略检测:认为未归一化,补两条范数
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        return dot / (na * nb) if na and nb else 0.0
    return dot
