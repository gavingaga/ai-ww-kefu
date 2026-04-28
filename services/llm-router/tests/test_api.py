"""FastAPI 集成测试,使用 LLM_MOCK=1 走 stub LLM。"""

from fastapi.testclient import TestClient

from llm_router.main import create_app
from llm_router.profiles import ModelProfile, ProfileRegistry


def make_client(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "1")
    reg = ProfileRegistry([ModelProfile(id="openai_default", api_key="sk-test")])
    return TestClient(create_app(reg))


def test_healthz(monkeypatch):
    c = make_client(monkeypatch)
    r = c.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_list_profiles_no_secret_leak(monkeypatch):
    c = make_client(monkeypatch)
    r = c.get("/v1/profiles")
    assert r.status_code == 200
    items = r.json()
    assert items
    for p in items:
        assert "api_key" not in p
        assert "api_key_last4" in p


def test_test_profile_with_mock(monkeypatch):
    c = make_client(monkeypatch)
    r = c.post("/v1/profiles/openai_default/test", json={"prompt": "你好"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "你好" in body["sample"] or "(mock)" in body["sample"]


def test_chat_stream_sse(monkeypatch):
    c = make_client(monkeypatch)
    r = c.post(
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "say hi"}], "stream": True},
    )
    assert r.status_code == 200
    text = r.text
    # SSE 格式:多个 data: 行 + 终止 [DONE]
    assert "data:" in text
    assert "[DONE]" in text


def test_chat_non_stream(monkeypatch):
    c = make_client(monkeypatch)
    r = c.post(
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "say hi"}], "stream": False},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["choices"][0]["message"]["content"]
