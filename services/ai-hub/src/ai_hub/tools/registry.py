"""工具注册表 — 按 OpenAI Chat Completions tools 协议组织。

每个工具携带 ``name`` / JSON Schema 入参 / 是否写操作(``write=True`` 默认 dry_run)
和异步 handler。详见 PRD 03 §2.5。

写操作类工具(``write=True``)在 dry_run 模式下不真的执行;handler 应自检
``ctx.dry_run`` 决定行为(返回"模拟结果"以让 LLM 解释给用户;实际副作用走二次确认通道)。
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


class ToolError(Exception):
    """工具执行失败。会以 role=tool 的错误消息回喂 LLM,而非中断整个会话。"""


@dataclass
class ToolContext:
    """工具运行上下文 — 由 ai-hub 注入。"""

    session_id: str = ""
    user_profile: dict[str, Any] = field(default_factory=dict)
    live_context: dict[str, Any] = field(default_factory=dict)
    dry_run: bool = True
    """写操作类工具默认 dry_run;由用户/坐席二次确认后才把 dry_run 关掉重跑。"""


ToolHandler = Callable[[dict[str, Any], ToolContext], Awaitable[Any]]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema(OpenAI tools 定义)
    handler: ToolHandler
    write: bool = False
    timeout_ms: int = 3_000

    def to_openai(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    def __init__(self) -> None:
        self._by_name: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._by_name:
            raise ValueError(f"tool already registered: {tool.name}")
        self._by_name[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._by_name.get(name)

    def all(self) -> list[Tool]:
        return list(self._by_name.values())

    def to_openai(self, names: list[str] | None = None) -> list[dict[str, Any]]:
        """转为 OpenAI tools[] 数组。names 不为空时仅取交集。"""
        if names is None:
            return [t.to_openai() for t in self._by_name.values()]
        out = []
        for n in names:
            t = self._by_name.get(n)
            if t:
                out.append(t.to_openai())
        return out


# ─────────────────────── 内置工具 demo(直播 / 点播领域) ───────────────────────


async def _get_play_diagnostics(
    args: dict[str, Any], ctx: ToolContext
) -> dict[str, Any]:
    """基于 live_context.play 给一个简化诊断(M2 起步 mock,真接 livectx-svc 在 T-220)。"""
    play = (ctx.live_context or {}).get("play") or {}
    bitrate = play.get("bitrate_kbps") or 0
    buf_events = play.get("buffer_events_60s") or 0
    err = play.get("last_error_code") or None
    cdn = play.get("cdn_node") or "unknown"
    network = (ctx.live_context or {}).get("network") or {}
    downlink = network.get("downlink_mbps") or 0

    if err and err.startswith(("CDN-", "ORIGIN-")):
        verdict = "cdn"
        suggested = {"type": "handoff", "payload": {"queue": "tech_support"}}
        summary = f"检测到 CDN 错误码 {err},节点 {cdn},建议转技术支持"
    elif downlink and downlink < 1.5:
        verdict = "local_network"
        suggested = {"type": "switch_quality", "payload": {"level": "480p"}}
        summary = f"客户端下行带宽 {downlink:.1f}Mbps 偏低,建议切到 480p"
    elif buf_events > 5:
        verdict = "local_network"
        suggested = {"type": "switch_quality", "payload": {"level": "720p"}}
        summary = f"60s 内卡顿 {buf_events} 次,建议降低清晰度"
    else:
        verdict = "unknown"
        suggested = {"type": "retry", "payload": {}}
        summary = "未检测到明显问题,建议刷新或重进直播间"

    return {
        "verdict": verdict,
        "summary": summary,
        "suggested_action": suggested,
        "qoe": {
            "bitrate_kbps": bitrate,
            "buffer_events_60s": buf_events,
            "cdn_node": cdn,
            "downlink_mbps": downlink,
            "last_error_code": err,
        },
        "args_echo": args,
    }


async def _get_membership(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    user = (ctx.live_context or {}).get("user") or {}
    profile = ctx.user_profile or {}
    return {
        "uid": args.get("uid") or profile.get("uid") or user.get("uid"),
        "level": user.get("level") or profile.get("level") or "free",
        "auto_renew": True,
        "expires_at": "2099-01-01T00:00:00Z",
        "is_minor_guard": bool(user.get("is_minor_guard")),
        "_mock": True,
    }


async def _cancel_subscription(
    args: dict[str, Any], ctx: ToolContext
) -> dict[str, Any]:
    if ctx.dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "would_cancel": {"uid": args.get("uid"), "sub_id": args.get("sub_id")},
            "message": "dry_run:实际未执行,等待用户在卡片上二次确认。",
        }
    # 真执行需走 tool-svc(T-224),M2 不在此处直接副作用
    return {"ok": False, "error": "live execution disabled in M2"}


def default_registry() -> ToolRegistry:
    """构建出厂内置工具注册表。"""
    reg = ToolRegistry()
    reg.register(
        Tool(
            name="get_play_diagnostics",
            description="拉取当前直播间 / 点播节目的播放诊断(QoE + 客户端网络)。播放问题排查必先调用。",
            parameters={
                "type": "object",
                "properties": {
                    "room_id": {"type": "integer", "description": "直播间 ID"},
                    "vod_id": {"type": "integer", "description": "点播节目 ID"},
                },
                "additionalProperties": False,
            },
            handler=_get_play_diagnostics,
            write=False,
        )
    )
    reg.register(
        Tool(
            name="get_membership",
            description="查询用户会员等级 / 订阅 / 自动续费状态。",
            parameters={
                "type": "object",
                "properties": {"uid": {"type": "integer"}},
                "additionalProperties": False,
            },
            handler=_get_membership,
            write=False,
        )
    )
    reg.register(
        Tool(
            name="cancel_subscription",
            description="取消用户的连续订阅。**写操作**,默认 dry_run。",
            parameters={
                "type": "object",
                "properties": {
                    "uid": {"type": "integer"},
                    "sub_id": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["uid", "sub_id"],
                "additionalProperties": False,
            },
            handler=_cancel_subscription,
            write=True,
        )
    )
    return reg
