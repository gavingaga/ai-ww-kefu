"""文档摄入流水线 — 切片 + 嵌入 + 入库。"""

from __future__ import annotations

import logging

from .chunker import ChunkerOpts, chunk_text
from .embed import Embedder
from .models import Chunk, Document
from .store import ChunkStore

logger = logging.getLogger(__name__)


async def ingest_document(
    *,
    doc: Document,
    store: ChunkStore,
    embedder: Embedder,
    chunker_opts: ChunkerOpts | None = None,
) -> list[Chunk]:
    """切片 → 嵌入 → 写入 store。返回落库的 chunks。"""
    pieces = chunk_text(doc.body, chunker_opts)
    if not pieces:
        return []
    embeddings = await embedder.embed(pieces)
    chunks: list[Chunk] = []
    for i, (text, vec) in enumerate(zip(pieces, embeddings, strict=False)):
        c = Chunk(
            id=f"{doc.id}#{i}",
            doc_id=doc.id,
            kb_id=doc.kb_id,
            title=doc.title,
            content=text,
            metadata=dict(doc.metadata) | {"chunk_index": i},
            embedding=vec,
        )
        store.add(c)
        chunks.append(c)
    logger.debug("ingest doc=%s chunks=%d", doc.id, len(chunks))
    return chunks
