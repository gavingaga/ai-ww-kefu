"""模型档位(model profile)定义与装载。

档位即一份可路由到的 LLM 凭据 + 参数:provider / base_url / api_key / model / params /
fallback_id 等。从两处装载,合并:

1. 环境变量 ``OPENAI_API_KEY`` / ``LLM_DEFAULT_MODEL`` 默认起一档 ``openai_default``
2. ``LLM_PROFILES_FILE`` 指向的 JSON 文件(可空),含一个数组,字段同 ``ModelProfile``

详见 PRD ``03-AI中枢-需求.md`` §5。
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ModelProfile(BaseModel):
    """单条模型档位。所有跨家供应商通过 base_url + api_key + model 表达。"""

    id: str
    provider: str = "openai"  # openai / azure_openai / anthropic / openai_compatible
    base_url: str = "https://api.openai.com/v1"
    api_key: str = Field(default="", repr=False)
    model: str = "gpt-4o-mini"
    params: dict[str, Any] = Field(default_factory=dict)
    timeout_ms: int = 15_000
    rpm: int = 600
    tpm: int = 200_000
    # 日预算(USD);0 = 不限。超阈值 80% 在响应头 X-Budget-Used-Pct 提示,>= 100% 拒绝
    budget_usd_daily: float = 0.0
    # USD per 1K tokens(估算用,生产以厂商账单为准)
    rate_in_per_1k: float = 0.0
    rate_out_per_1k: float = 0.0
    fallback_id: str | None = None
    tags: list[str] = Field(default_factory=lambda: ["default"])

    def safe_dict(self) -> dict[str, Any]:
        """对外展示用,api_key 仅留后 4 位。"""
        d = self.model_dump()
        d["api_key_last4"] = self.api_key[-4:] if self.api_key else ""
        d.pop("api_key", None)
        return d


class ProfileRegistry:
    """模型档位注册表。线程不安全(只在启动时构建)。"""

    def __init__(self, profiles: list[ModelProfile]):
        self._by_id: dict[str, ModelProfile] = {p.id: p for p in profiles}

    @classmethod
    def from_env(cls) -> "ProfileRegistry":
        from .kms import KMS_PREFIX, LocalKmsResolver, resolve_api_key

        profiles: list[ModelProfile] = []

        path = os.getenv("LLM_PROFILES_FILE")
        if path:
            file = Path(path)
            if file.is_file():
                try:
                    raw = json.loads(file.read_text(encoding="utf-8"))
                    profiles.extend(ModelProfile.model_validate(p) for p in raw)
                    logger.info("llm-router: loaded %d profiles from %s", len(profiles), path)
                except Exception:  # noqa: BLE001
                    logger.exception("llm-router: failed to load profiles file %s", path)

        if not any(p.id == "openai_default" for p in profiles):
            api_key = os.getenv("OPENAI_API_KEY", "")
            base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
            model = os.getenv("LLM_DEFAULT_MODEL", "gpt-4o-mini")
            profiles.insert(
                0,
                ModelProfile(
                    id="openai_default",
                    provider="openai",
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    params={"temperature": 0.3, "max_tokens": 800},
                    tags=["default"],
                ),
            )

        # 把 kms:// 前缀的 api_key 解出真值;失败保留为空(走"未配置"路径)
        resolver = LocalKmsResolver()
        for p in profiles:
            if p.api_key and p.api_key.startswith(KMS_PREFIX):
                p.api_key = resolve_api_key(p.api_key, resolver)

        return cls(profiles)

    def get(self, profile_id: str) -> ModelProfile | None:
        return self._by_id.get(profile_id)

    def all(self) -> list[ModelProfile]:
        return list(self._by_id.values())

    def upsert(self, profile: ModelProfile) -> ModelProfile:
        """新增或更新 — 内存即时生效。

        api_key 为空字符串时保留旧值(防管理后台未填 key 误清);明确传非空才覆盖。
        """
        existing = self._by_id.get(profile.id)
        if existing and not profile.api_key and existing.api_key:
            profile = profile.model_copy(update={"api_key": existing.api_key})
        self._by_id[profile.id] = profile
        return profile

    def remove(self, profile_id: str) -> bool:
        return self._by_id.pop(profile_id, None) is not None

    def chain(self, profile_id: str, max_depth: int = 3) -> list[ModelProfile]:
        """沿 fallback_id 解出路由链,最多 max_depth 层。"""
        out: list[ModelProfile] = []
        cur_id = profile_id
        seen: set[str] = set()
        while cur_id and cur_id not in seen and len(out) < max_depth:
            seen.add(cur_id)
            p = self._by_id.get(cur_id)
            if not p:
                break
            out.append(p)
            cur_id = p.fallback_id or ""
        return out
