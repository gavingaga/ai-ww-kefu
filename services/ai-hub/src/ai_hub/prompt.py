"""Prompt 编排 — 把会话历史 + live_context + 业务字典拼到 system / messages。

与 PRD 03-AI中枢-需求.md §2.6 一致;M2 起步只渲染 default 模板,A/B 与版本化在 T-216 接入。
"""

from __future__ import annotations

import json
from typing import Any

DEFAULT_BRAND = "ai-kefu"

DEFAULT_SYSTEM_TEMPLATE = """\
你是「{brand}」官方智能客服(直播 / 点播平台),语气专业、礼貌、简洁,使用中文回答。

- 仅依据【知识资料】与【实时业务数据】回答,资料不足请直接说「我帮你转人工」。
- 不得承诺资料外的优惠 / 赔偿 / 时效;不解释平台审核细节、风控规则原文。
- 涉及订阅 / 退款 / 打赏 / 会员必须先调用工具核实;**未成年人打赏退款一律转人工**。
- 涉及内容举报、版权、主播封禁申诉,直接转对应技能组。
- 回答 ≤ 200 字,卡顿建议 ≤ 3 步、分点。

【用户画像】{profile_json}
【直播 / 点播上下文】{live_context_json}
【会话摘要】{summary}
【实时业务数据】{tool_results_json}
【知识资料】{rag_chunks}
"""


def render_system(
    *,
    brand: str | None = None,
    profile: dict[str, Any] | None = None,
    live_context: dict[str, Any] | None = None,
    summary: str = "",
    tool_results: dict[str, Any] | None = None,
    rag_chunks: str = "",
) -> str:
    return DEFAULT_SYSTEM_TEMPLATE.format(
        brand=brand or DEFAULT_BRAND,
        profile_json=_json(profile or {}),
        live_context_json=_json(live_context or {}),
        summary=summary or "(无)",
        tool_results_json=_json(tool_results or {}),
        rag_chunks=rag_chunks or "(无)",
    )


def build_messages(
    *,
    user_text: str,
    history: list[dict[str, str]] | None = None,
    system_text: str | None = None,
) -> list[dict[str, str]]:
    """把历史 + 当前用户输入拼成 OpenAI messages。

    history 已经是 OpenAI 风格(role/content);只支持 user / assistant / system 三种;
    超长由调用方裁剪。
    """
    msgs: list[dict[str, str]] = []
    if system_text:
        msgs.append({"role": "system", "content": system_text})
    if history:
        for h in history:
            role = h.get("role")
            if role not in {"user", "assistant", "system"}:
                continue
            content = (h.get("content") or "").strip()
            if not content:
                continue
            msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": user_text})
    return msgs


def _json(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    except Exception:  # noqa: BLE001
        return "{}"
