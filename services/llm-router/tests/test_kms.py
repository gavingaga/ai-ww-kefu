"""KMS 解析单测 — 局部 mock,避免污染真实环境。"""

from __future__ import annotations

import json
import logging

from llm_router.kms import KMS_PREFIX, LocalKmsResolver, resolve_api_key


def test_local_kms_reads_env(monkeypatch):
    monkeypatch.setenv("LLM_KMS_KEYS", json.dumps({"k1": "sk-secret-001"}))
    r = LocalKmsResolver()
    assert r.resolve("k1") == "sk-secret-001"
    assert r.resolve("missing") is None


def test_resolve_passthrough_when_not_kms_ref(monkeypatch):
    monkeypatch.delenv("LLM_KMS_KEYS", raising=False)
    assert resolve_api_key("sk-plain") == "sk-plain"
    assert resolve_api_key("") == ""


def test_resolve_kms_substitutes_secret(monkeypatch):
    monkeypatch.setenv("LLM_KMS_KEYS", json.dumps({"prod-openai": "sk-real-1234"}))
    out = resolve_api_key(KMS_PREFIX + "aws/prod-openai")
    assert out == "sk-real-1234"


def test_resolve_kms_returns_empty_when_unresolved(monkeypatch, caplog):
    monkeypatch.setenv("LLM_KMS_KEYS", "{}")
    with caplog.at_level(logging.WARNING):
        out = resolve_api_key(KMS_PREFIX + "aws/missing")
    assert out == ""
    assert any("未解析到 secret" in m for m in caplog.messages)


def test_log_only_masks_last_4(monkeypatch, caplog):
    monkeypatch.setenv("LLM_KMS_KEYS", json.dumps({"k": "sk-supersecret-XYZAB"}))
    with caplog.at_level(logging.INFO):
        resolve_api_key(KMS_PREFIX + "aws/k")
    joined = "\n".join(caplog.messages)
    assert "supersecret" not in joined
    assert "XYZAB" not in joined
    # 仅末 4 位
    assert "ZAB" in joined or "***" in joined
