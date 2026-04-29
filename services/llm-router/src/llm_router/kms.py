"""KMS 抽象 — 让 profile.api_key 可以是 ``kms://<provider>/<key_id>`` 形式。

启动 / 配置变更时,Resolver 把 kms:// 前缀的占位换成真实 secret 注入内存;
日志只暴露后 4 位。生产替换为 AWS KMS / 腾讯 KMS / Vault 调用。
"""

from __future__ import annotations

import json
import logging
import os
from typing import Protocol

logger = logging.getLogger(__name__)


KMS_PREFIX = "kms://"


class KmsResolver(Protocol):
    def resolve(self, key_id: str) -> str | None:  # noqa: D401
        """根据 key_id 拿真 secret;失败返 None。"""


class LocalKmsResolver:
    """演示用:从环境变量 LLM_KMS_KEYS={"<key_id>":"<secret>"} 读取。

    生产替换为云厂商 KMS 客户端。
    """

    def __init__(self, env: str = "LLM_KMS_KEYS") -> None:
        self._env = env
        self._cache: dict[str, str] | None = None

    def _load(self) -> dict[str, str]:
        if self._cache is not None:
            return self._cache
        raw = os.getenv(self._env, "")
        out: dict[str, str] = {}
        if raw.strip():
            try:
                out = {str(k): str(v) for k, v in json.loads(raw).items()}
            except Exception:  # noqa: BLE001
                logger.warning("LocalKmsResolver: %s 不是合法 JSON,忽略", self._env)
        self._cache = out
        return out

    def resolve(self, key_id: str) -> str | None:
        return self._load().get(key_id)


def _mask(secret: str) -> str:
    if not secret:
        return ""
    return ("***" + secret[-4:]) if len(secret) > 4 else "***"


def resolve_api_key(api_key: str, resolver: KmsResolver | None = None) -> str:
    """
    若 ``api_key`` 形如 ``kms://<provider>/<key_id>``,通过 resolver 解出真值;
    否则原样返回。失败 / 未配置时返回空串(让上层走 ``invalid api_key`` 路径)。
    """
    if not api_key or not api_key.startswith(KMS_PREFIX):
        return api_key
    body = api_key[len(KMS_PREFIX) :]
    parts = body.split("/", 1)
    if len(parts) != 2:
        logger.warning("kms ref malformed (need provider/key_id): %s", body)
        return ""
    provider, key_id = parts
    r = resolver or LocalKmsResolver()
    secret = r.resolve(key_id)
    if not secret:
        logger.warning("kms %s/%s 未解析到 secret", provider, key_id)
        return ""
    logger.info("kms %s/%s -> %s", provider, key_id, _mask(secret))
    return secret


def resolve_profiles(profiles: list, resolver: KmsResolver | None = None) -> None:
    """就地把所有 profile 中 kms:// 前缀的 api_key 替换为真值。"""
    r = resolver or LocalKmsResolver()
    for p in profiles:
        ak = getattr(p, "api_key", "") or ""
        if ak.startswith(KMS_PREFIX):
            real = resolve_api_key(ak, r)
            try:
                p.api_key = real
            except Exception:  # noqa: BLE001
                # pydantic v2 不可变?用 model_copy 替换;调用方自管引用列表
                pass
