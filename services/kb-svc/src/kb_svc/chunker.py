"""文档切片 — 段落优先 + 长度滑窗。

对中文友好(按字符长度);对接真实 NLP/语义切分留接口。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ChunkerOpts:
    max_chars: int = 320
    """单 chunk 最大字符数。"""
    overlap: int = 40
    """相邻 chunk 重叠字符数。"""


def chunk_text(body: str, opts: ChunkerOpts | None = None) -> list[str]:
    """先按空行分段,再用滑窗切到 max_chars。"""
    o = opts or ChunkerOpts()
    if not body:
        return []
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    out: list[str] = []
    for p in paragraphs:
        if len(p) <= o.max_chars:
            out.append(p)
            continue
        i = 0
        while i < len(p):
            piece = p[i : i + o.max_chars]
            if not piece.strip():
                break
            out.append(piece)
            if i + o.max_chars >= len(p):
                break
            i += max(1, o.max_chars - o.overlap)
    return out
