"""启动时把 ``seeds/seed_default.json`` 摄入到内存 store。"""

from __future__ import annotations

import json
import logging
from importlib import resources
from typing import Any

from .embed import Embedder
from .ingest import ingest_document
from .models import Document
from .store import ChunkStore

logger = logging.getLogger(__name__)


async def load_default_seeds(store: ChunkStore, embedder: Embedder) -> int:
    try:
        raw = resources.files(__package__).joinpath("seeds/seed_default.json").read_text(
            encoding="utf-8"
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("seed not found: %s", e)
        return 0
    items: list[dict[str, Any]] = json.loads(raw)
    count = 0
    for it in items:
        doc = Document(
            id=str(it["id"]),
            kb_id=str(it.get("kb_id") or "default"),
            title=str(it.get("title") or ""),
            body=str(it.get("body") or ""),
            metadata=it.get("metadata") or {},
        )
        chunks = await ingest_document(doc=doc, store=store, embedder=embedder)
        count += len(chunks)
    logger.info("kb-svc seed loaded: %d chunks", count)
    return count
