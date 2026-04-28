"""轻量重排器 — token 重叠 + 长度归一,M2 起步用;接口预留 BGE-Reranker。"""

from __future__ import annotations

from .tokenize import tokenize


def lexical_rerank_score(query: str, content: str) -> float:
    q = set(tokenize(query))
    if not q:
        return 0.0
    d = tokenize(content)
    if not d:
        return 0.0
    inter = sum(1 for t in d if t in q)
    overlap = inter / max(len(q), 1)
    # 短文本(标题)更易满分,适度归一
    length_factor = 1.0 / (1.0 + max(len(d) - 80, 0) / 200.0)
    return overlap * length_factor
