"""Prompt 编排 — 按 ``live_context.scene`` 路由到带版本号的 prompt 模板(T-209)。

模板装载与查询见 :mod:`ai_hub.prompts.registry`;模板文件位于
``ai_hub/prompts/templates/<scene>__<version>.md``。详见 PRD 03-AI 中枢-需求.md §2.6。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .prompts.registry import PromptRegistry, PromptTemplate

logger = logging.getLogger(__name__)

DEFAULT_BRAND = "ai-kefu"

# 进程级单例 — 启动时构造一次,M2 起步不做热更新
_registry: PromptRegistry | None = None


def get_registry() -> PromptRegistry:
    global _registry
    if _registry is None:
        _registry = PromptRegistry.from_default()
    return _registry


def reset_registry() -> None:
    """单测或热更新时调用。"""
    global _registry
    _registry = None


def select_template(
    scene: str | None,
    version: int | None = None,
) -> PromptTemplate:
    """按 scene + version 选模板,缺失回落到 default。"""
    return get_registry().get(scene, version)


def render_system(
    *,
    brand: str | None = None,
    profile: dict[str, Any] | None = None,
    live_context: dict[str, Any] | None = None,
    summary: str = "",
    tool_results: dict[str, Any] | None = None,
    rag_chunks: str = "",
    scene: str | None = None,
    version: int | None = None,
) -> str:
    body, _ = render_with_meta(
        brand=brand,
        profile=profile,
        live_context=live_context,
        summary=summary,
        tool_results=tool_results,
        rag_chunks=rag_chunks,
        scene=scene,
        version=version,
    )
    return body


def render_with_meta(
    *,
    brand: str | None = None,
    profile: dict[str, Any] | None = None,
    live_context: dict[str, Any] | None = None,
    summary: str = "",
    tool_results: dict[str, Any] | None = None,
    rag_chunks: str = "",
    scene: str | None = None,
    version: int | None = None,
) -> tuple[str, PromptTemplate]:
    """同 :func:`render_system` 但同时返回所选模板,方便 trace 写入选档信息。"""
    chosen = scene or _scene_from_context(live_context)
    tmpl = select_template(chosen, version)
    body = tmpl.body.format(
        brand=brand or DEFAULT_BRAND,
        profile_json=_json(profile or {}),
        live_context_json=_json(live_context or {}),
        summary=summary or "(无)",
        tool_results_json=_json(tool_results or {}),
        rag_chunks=rag_chunks or "(无)",
    )
    return body, tmpl


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


def _scene_from_context(live_context: dict[str, Any] | None) -> str:
    if not live_context:
        return "default"
    scene = live_context.get("scene")
    if not isinstance(scene, str) or not scene:
        return "default"
    # 与 packages/proto/live-context/live-context.schema.json 的 enum 对齐
    return scene.lower()


def _json(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    except Exception:  # noqa: BLE001
        return "{}"
