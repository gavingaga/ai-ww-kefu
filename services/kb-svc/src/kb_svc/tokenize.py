"""极简 token 化(中文按字符 + 英数按词)— 与 notify-svc Tokenizer 同思路。

避免引入 jieba / tiktoken 等大依赖;真生产应换 sentence-transformers tokenizer + 多语言。
"""

from __future__ import annotations

import re

_WORD_RE = re.compile(r"[A-Za-z0-9_]+")


def tokenize(text: str) -> list[str]:
    if not text:
        return []
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c.isspace() or c in ",.;:!?()[]{}<>'\"-/、,。;:!?()【】《》「」":
            i += 1
            continue
        cp = ord(c)
        if 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF:
            out.append(c)
            i += 1
            continue
        if c.isascii() and (c.isalnum() or c == "_"):
            j = i
            while j < n and text[j].isascii() and (text[j].isalnum() or text[j] == "_"):
                j += 1
            out.append(text[i:j].lower())
            i = j
            continue
        i += 1
    if not out:
        out.extend(m.group().lower() for m in _WORD_RE.finditer(text))
    return out
