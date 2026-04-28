"""Handoff Packet 生成 — 转人工时给坐席的"接力包"。

字段对齐 PRD 03 §3 与 08-数据模型 §2.11(handoff 表的 packet 字段)。
M2 起步:
    - summary 默认由一次最简 LLM 调用产出(注入式 LLMCall);LLM 不可用时本地拼模板
    - suggested_replies 同理(可选)
    - entities 抽取仅做最常见模式(订单号 / room_id / vod_id);完整 NER 在 T-208 完整版
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

logger = logging.getLogger(__name__)


HandoffReason = Literal[
    "rule_keyword",
    "rule_blacklist",
    "user_request",
    "rag_low_confidence",
    "tool_failure",
    "repeat_unresolved",
    "minor_compliance",
    "report_compliance",
    "system_error",
]

# 注入式 LLM 调用 — 与 tool_loop.LLMCall 形态一致,但不带 tools。
LLMCall = Callable[
    [list[dict[str, Any]]],
    Awaitable[str],
]


@dataclass
class KnowledgeHit:
    title: str
    url: str = ""


@dataclass
class HandoffPacket:
    """转人工接力包。字段命名遵循 PRD,对外序列化用 :meth:`to_dict`。"""

    session_id: str
    reason: HandoffReason
    user: dict[str, Any] = field(default_factory=dict)
    """用户画像快照(level / tags / is_anchor / is_minor_guard 等)。"""
    summary: str = ""
    """一句话会话摘要(由 LLM 或本地模板产出)。"""
    history: list[dict[str, Any]] = field(default_factory=list)
    """最近 N 轮对话(role/content/ts 子集)。"""
    entities: dict[str, Any] = field(default_factory=dict)
    """从对话与 live_context 中抽出的关键实体(order_id / room_id / vod_id ...)。"""
    suggested_replies: list[str] = field(default_factory=list)
    """坐席首次接入时的候选回复(2~3 条)。"""
    knowledge_hits: list[KnowledgeHit] = field(default_factory=list)
    """RAG / FAQ 命中的资料指针(M2 起步 FAQ 命中走 FAQ 通道,这里通常为空)。"""
    live_context: dict[str, Any] = field(default_factory=dict)
    """当前直播 / 点播业务上下文快照。"""
    skill_group_hint: str = ""
    """建议的技能组(由 reason + scene 推导),routing-svc 可参考。"""

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "reason": self.reason,
            "user": self.user,
            "summary": self.summary,
            "history": self.history,
            "entities": self.entities,
            "suggested_replies": self.suggested_replies,
            "knowledge_hits": [{"title": k.title, "url": k.url} for k in self.knowledge_hits],
            "live_context": self.live_context,
            "skill_group_hint": self.skill_group_hint,
        }


# ───────────── 实体抽取(简化版) ─────────────────

_ORDER_RE = re.compile(r"(?:订单|order|#)\s*([A-Za-z0-9]{4,})")
_AMOUNT_RE = re.compile(r"(?:¥|￥|\$)?\s*(\d{2,8})\s*(?:元|块)?")


def extract_entities(
    user_text: str, live_context: dict[str, Any] | None
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    lc = live_context or {}
    for k in ("room_id", "vod_id", "anchor_id", "program_title"):
        if lc.get(k) is not None:
            out[k] = lc[k]
    if user_text:
        m = _ORDER_RE.search(user_text)
        if m:
            out["order_id"] = m.group(1)
        if any(w in user_text for w in ("退款", "充值", "打赏")):
            am = _AMOUNT_RE.search(user_text)
            if am:
                out["amount_hint"] = am.group(1)
    return out


# ───────────── 技能组建议 ─────────────────

_SCENE_TO_GROUP = {
    "live_room": "play_tech",
    "vod_detail": "content_copyright",
    "anchor_console": "anchor_community",
    "report_flow": "content_copyright",
    "settings": "membership_payment",
}


def suggest_skill_group(reason: HandoffReason, live_context: dict[str, Any] | None) -> str:
    if reason == "minor_compliance":
        return "minor_compliance"
    if reason == "report_compliance":
        return "content_copyright"
    if reason in {"tool_failure", "rag_low_confidence"}:
        scene = (live_context or {}).get("scene")
        return _SCENE_TO_GROUP.get(scene or "", "general")
    if reason == "rule_keyword":
        # 关键词命中,默认走通用专席;具体由后台规则细化
        return "general"
    return "general"


# ───────────── 历史裁剪 ─────────────────


def take_recent_history(
    history: list[dict[str, str]] | None, current_user_text: str, max_turns: int = 8
) -> list[dict[str, Any]]:
    """取最近 max_turns 轮 + 当前用户输入,过滤空内容与非法 role。"""
    out: list[dict[str, Any]] = []
    if history:
        for h in history[-max_turns * 2 :]:
            role = h.get("role")
            if role not in {"user", "assistant", "system", "tool"}:
                continue
            content = (h.get("content") or "").strip()
            if not content:
                continue
            out.append({"role": role, "content": content})
    out.append({"role": "user", "content": current_user_text})
    return out


# ───────────── 主入口 ─────────────────


_LOCAL_SUMMARY_TPL = (
    "用户在【{scene}】场景下提出问题。"
    "原话:「{quoted}」。"
    "命中转人工原因:{reason}。"
)

_FALLBACK_REPLIES_BY_REASON: dict[str, list[str]] = {
    "minor_compliance": [
        "您好,我是合规专席,您反映的未成年人误操作充值我已收到。请提供监护人证明 + 支付记录截图,我会在 7 个工作日内书面答复。",
        "感谢您的反馈,接下来我会按未成年人保护流程处理,请稍候我先核对账户与订单。",
    ],
    "report_compliance": [
        "您好,我是内容审核专席。您的举报已收到,我会在 30 分钟内介入处置;无需您再补充内容。",
        "举报已立案,平台会按规则严肃处理。如有补充证据可在此发送给我。",
    ],
    "rule_keyword": [
        "您好,我是人工客服,刚刚已为您完成接入。请把具体问题再简述一次,我立刻为您处理。",
        "您好,看到您的需求,我马上协助。",
    ],
    "user_request": [
        "您好,我是人工客服,已为您接入。请问需要怎么帮您?",
    ],
}


async def build_handoff_packet(
    *,
    session_id: str,
    reason: HandoffReason,
    user_text: str,
    history: list[dict[str, str]] | None,
    profile: dict[str, Any] | None,
    live_context: dict[str, Any] | None,
    llm_call: LLMCall | None = None,
    knowledge_hits: list[KnowledgeHit] | None = None,
    max_history_turns: int = 8,
) -> HandoffPacket:
    """构造 HandoffPacket。

    若提供 ``llm_call``,优先使用 LLM 生成 summary + suggested_replies;
    失败或未提供时落入本地模板。
    """
    profile = profile or {}
    live_context = live_context or {}
    history_clean = take_recent_history(history, user_text, max_history_turns)

    # 用户画像优先取 profile,补 live_context.user
    user = {
        **(live_context.get("user") or {}),
        **{k: v for k, v in profile.items() if v is not None},
    }
    user["id"] = user.get("id") or user.get("uid")

    entities = extract_entities(user_text, live_context)

    summary = ""
    suggested: list[str] = []
    if llm_call:
        try:
            summary = await _llm_summarize(llm_call, history_clean, reason, live_context)
        except Exception as e:  # noqa: BLE001
            logger.warning("handoff: llm summarize failed: %s", e)
        try:
            suggested = await _llm_suggest_replies(llm_call, history_clean, reason)
        except Exception as e:  # noqa: BLE001
            logger.warning("handoff: llm suggest failed: %s", e)

    if not summary:
        summary = _LOCAL_SUMMARY_TPL.format(
            scene=live_context.get("scene", "default"),
            quoted=(user_text or "").strip()[:120] or "(无明确诉求)",
            reason=reason,
        )
    if not suggested:
        suggested = list(
            _FALLBACK_REPLIES_BY_REASON.get(reason, _FALLBACK_REPLIES_BY_REASON["user_request"])
        )

    return HandoffPacket(
        session_id=session_id,
        reason=reason,
        user=user,
        summary=summary.strip(),
        history=history_clean,
        entities=entities,
        suggested_replies=suggested,
        knowledge_hits=knowledge_hits or [],
        live_context=live_context,
        skill_group_hint=suggest_skill_group(reason, live_context),
    )


# ───────────── LLM 摘要与候选 ─────────────


_SUMMARIZE_PROMPT = (
    "你是客服会话摘要助手。请用一句话(≤80 字)概括用户的关键诉求与情绪;"
    "突出与转人工原因相关的事实(如订单号 / 直播间 / 节目);不要出现你的猜测、不要使用感叹号。"
    "仅输出摘要文本,无前后缀。"
)

_SUGGEST_PROMPT = (
    "你是客服坐席接入辅助。基于会话历史,给出 2 条对客回复候选,"
    "每条 ≤ 80 字,礼貌、专业、简洁,不承诺资料外的优惠/赔偿/时效。"
    "仅以 JSON 数组形式输出,如:[\"回复1\",\"回复2\"];不要任何其它内容。"
)


async def _llm_summarize(
    llm_call: LLMCall,
    history: list[dict[str, Any]],
    reason: HandoffReason,
    live_context: dict[str, Any],
) -> str:
    msgs = [
        {"role": "system", "content": _SUMMARIZE_PROMPT},
        {
            "role": "user",
            "content": (
                f"【转人工原因】{reason}\n"
                f"【场景】{live_context.get('scene', 'default')}\n"
                f"【对话】\n"
                + "\n".join(f"{m['role']}: {m['content']}" for m in history)
            ),
        },
    ]
    out = await llm_call(msgs)
    return out.strip()


async def _llm_suggest_replies(
    llm_call: LLMCall,
    history: list[dict[str, Any]],
    reason: HandoffReason,
) -> list[str]:
    msgs = [
        {"role": "system", "content": _SUGGEST_PROMPT},
        {
            "role": "user",
            "content": (
                f"【转人工原因】{reason}\n【对话】\n"
                + "\n".join(f"{m['role']}: {m['content']}" for m in history)
            ),
        },
    ]
    out = (await llm_call(msgs)).strip()
    # 容错:解析 JSON 数组;失败则按行切
    try:
        arr = json.loads(out)
        if isinstance(arr, list):
            return [str(x).strip() for x in arr if str(x).strip()][:3]
    except json.JSONDecodeError:
        pass
    return [ln.strip("- ").strip() for ln in out.splitlines() if ln.strip()][:3]
