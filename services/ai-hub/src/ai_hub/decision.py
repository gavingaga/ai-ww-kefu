"""决策器 — M2 最小版。

按 PRD 03-AI中枢-需求.md §2.2 的优先级:
    HANDOFF(规则)→ FAQ → TOOL → RAG → LLM → 兜底

M2 起步只接 HANDOFF + LLM 两条路径;FAQ/TOOL/RAG 在后续 ticket 接入(T-208/T-213/T-222)。
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass


# 与 PRD 01-业务流程与场景 §2 对齐:必转人工的关键词
DEFAULT_HANDOFF_KEYWORDS = (
    "投诉",
    "人工",
    "客服",
    "退款",
    "未成年",
    "举报",
    "版权",
    "封禁",
)


def _load_keywords() -> tuple[str, ...]:
    raw = os.getenv("AI_HUB_HANDOFF_KEYWORDS", "")
    if not raw.strip():
        return DEFAULT_HANDOFF_KEYWORDS
    return tuple(k.strip() for k in raw.split(",") if k.strip())


@dataclass(frozen=True)
class Decision:
    """决策结果。"""

    action: str  # "handoff" | "llm_general" | "faq" | "rag" | "tool"
    reason: str
    confidence: float
    hits: list[str]


def decide(user_text: str, keywords: tuple[str, ...] | None = None) -> Decision:
    """根据用户输入做决策。

    M2 简化:
      - 命中 handoff 关键词 → action=handoff
      - 否则 → action=llm_general
    """
    text = (user_text or "").strip()
    if not text:
        return Decision(action="llm_general", reason="empty input", confidence=0.0, hits=[])

    kws = keywords or _load_keywords()
    hits = [k for k in kws if k in text]
    if hits:
        return Decision(
            action="handoff",
            reason="rule_keyword",
            confidence=1.0,
            hits=hits,
        )

    # 多轮重复未解决等更复杂规则在 T-219 接;先简单兜底到 LLM
    return Decision(
        action="llm_general",
        reason="default",
        confidence=0.5,
        hits=[],
    )


# 简单工具:供单测与集成使用
_HANDOFF_PROMPT = re.compile(r"^(我要|帮我)?\s*(投诉|退款|转人工|找客服)", re.IGNORECASE)


def is_obvious_handoff(text: str) -> bool:
    return bool(_HANDOFF_PROMPT.search(text or ""))
