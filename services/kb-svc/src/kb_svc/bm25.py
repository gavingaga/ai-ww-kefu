"""极简 BM25 实现 — 满足 hybrid 检索的 BM25 通道,无需第三方。

BM25 公式(Robertson):
    score = Σ idf(qᵢ) · (f(qᵢ,D)·(k1+1)) / (f(qᵢ,D) + k1·(1 - b + b·|D|/avgdl))

仅在 add 时一次性建立倒排表;query 时遍历 query token 累加得分。
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .tokenize import tokenize


@dataclass
class BM25Index:
    k1: float = 1.5
    b: float = 0.75

    # state
    docs: list[list[str]] = field(default_factory=list)
    doc_lens: list[int] = field(default_factory=list)
    df: dict[str, int] = field(default_factory=dict)
    """document frequency:出现该 term 的 doc 数"""
    inv: dict[str, dict[int, int]] = field(default_factory=lambda: defaultdict(dict))
    """term → { doc_idx: term_freq }"""
    avgdl: float = 0.0
    n: int = 0

    def add(self, text: str) -> int:
        tokens = tokenize(text)
        doc_idx = len(self.docs)
        self.docs.append(tokens)
        self.doc_lens.append(len(tokens))
        for tok, tf in Counter(tokens).items():
            self.inv[tok][doc_idx] = tf
            self.df[tok] = self.df.get(tok, 0) + 1
        self.n += 1
        if self.n:
            self.avgdl = sum(self.doc_lens) / self.n
        return doc_idx

    def search(self, query: str, top_k: int = 10) -> list[tuple[int, float]]:
        if self.n == 0:
            return []
        q_tokens = tokenize(query)
        if not q_tokens:
            return []
        scores: dict[int, float] = defaultdict(float)
        for q in q_tokens:
            postings = self.inv.get(q)
            if not postings:
                continue
            df_q = self.df.get(q, 1)
            idf = math.log(1 + (self.n - df_q + 0.5) / (df_q + 0.5))
            for doc_idx, tf in postings.items():
                dl = self.doc_lens[doc_idx]
                norm = 1 - self.b + self.b * (dl / self.avgdl if self.avgdl else 1)
                contrib = idf * (tf * (self.k1 + 1)) / (tf + self.k1 * norm)
                scores[doc_idx] += contrib
        if not scores:
            return []
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
        return ranked
