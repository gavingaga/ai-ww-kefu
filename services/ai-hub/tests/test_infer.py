"""ai-hub /v1/ai/infer SSE 集成测试,使用 inline mock(不依赖 llm-router)。"""

from fastapi.testclient import TestClient

from ai_hub.main import create_app


def make_client(monkeypatch):
    monkeypatch.setenv("AI_HUB_LLM_INLINE_MOCK", "1")
    return TestClient(create_app())


def parse_sse_events(text: str):
    events = []
    for line in text.splitlines():
        if line.startswith("data:"):
            events.append(line[5:].strip())
    return events


def test_handoff_path(monkeypatch):
    c = make_client(monkeypatch)
    r = c.post(
        "/v1/ai/infer",
        json={
            "session_id": "ses_1",
            "user_text": "我要投诉这个主播,涉黄",
            "stream": True,
        },
    )
    assert r.status_code == 200
    events = parse_sse_events(r.text)
    assert any('"action":"handoff"' in e or '"action": "handoff"' in e for e in events)
    assert any('"event":"handoff"' in e or '"event": "handoff"' in e for e in events)
    assert any('"event":"done"' in e or '"event": "done"' in e for e in events)


def test_llm_general_path(monkeypatch):
    c = make_client(monkeypatch)
    r = c.post(
        "/v1/ai/infer",
        json={
            "session_id": "ses_1",
            "user_text": "我看视频卡顿,怎么处理",
            "live_context": {"scene": "live_room", "room_id": 8001},
            "stream": True,
        },
    )
    assert r.status_code == 200
    events = parse_sse_events(r.text)
    assert any('"action":"llm_general"' in e or '"action": "llm_general"' in e for e in events)
    assert any('"event":"token"' in e or '"event": "token"' in e for e in events)
    assert any('"event":"done"' in e or '"event": "done"' in e for e in events)


def test_healthz(monkeypatch):
    c = make_client(monkeypatch)
    r = c.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
