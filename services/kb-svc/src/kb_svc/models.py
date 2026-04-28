"""kb-svc 数据模型。M2 起步内存表示,M3 末接 Milvus + MySQL。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Document:
    id: str
    kb_id: str
    title: str
    body: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Chunk:
    id: str
    doc_id: str
    kb_id: str
    title: str
    """所属文档的标题(冗余存,便于召回结果展示)。"""
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    embedding: list[float] | None = None


@dataclass
class Hit:
    chunk: Chunk
    score: float
    """最终融合分(经 reranker)。"""

    vector_score: float = 0.0
    bm25_score: float = 0.0
    rerank_score: float = 0.0
    rank: int = 0

    def to_payload(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk.id,
            "doc_id": self.chunk.doc_id,
            "kb_id": self.chunk.kb_id,
            "title": self.chunk.title,
            "content": self.chunk.content,
            "metadata": self.chunk.metadata,
            "score": round(self.score, 4),
            "vector_score": round(self.vector_score, 4),
            "bm25_score": round(self.bm25_score, 4),
            "rerank_score": round(self.rerank_score, 4),
            "rank": self.rank,
        }
