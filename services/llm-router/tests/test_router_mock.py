"""LLM_MOCK=1 路径的端到端测试 — 不依赖真 OpenAI。"""

import pytest

from llm_router.profiles import ModelProfile, ProfileRegistry
from llm_router.router import Router


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "1")


@pytest.mark.asyncio
async def test_stream_yields_tokens_and_done():
    reg = ProfileRegistry([ModelProfile(id="m1", api_key="x")])
    r = Router(reg)
    chunks = []
    async for c in r.stream("m1", [{"role": "user", "content": "hi"}]):
        chunks.append(c)
    assert any("event" in c and c["event"] == "done" for c in chunks)
    text = "".join(
        c.get("choices", [{}])[0].get("delta", {}).get("content", "") for c in chunks if "choices" in c
    )
    assert "hi" in text


@pytest.mark.asyncio
async def test_once_returns_string():
    reg = ProfileRegistry([ModelProfile(id="m1", api_key="x")])
    r = Router(reg)
    text = await r.once("m1", [{"role": "user", "content": "hi"}])
    assert isinstance(text, str)
    assert text


@pytest.mark.asyncio
async def test_unknown_profile_raises():
    reg = ProfileRegistry([ModelProfile(id="m1")])
    r = Router(reg)
    with pytest.raises(Exception):
        async for _ in r.stream("m999", [{"role": "user", "content": "x"}]):
            pass
