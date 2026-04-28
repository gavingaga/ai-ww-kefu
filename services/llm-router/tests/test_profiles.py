import json

from llm_router.profiles import ModelProfile, ProfileRegistry


def test_default_registry_has_openai_default(monkeypatch):
    monkeypatch.delenv("LLM_PROFILES_FILE", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    reg = ProfileRegistry.from_env()
    p = reg.get("openai_default")
    assert p is not None
    assert p.model in {"gpt-4o-mini", "gpt-4o"} or p.model.startswith("gpt")
    assert p.api_key == "sk-test"
    assert p.safe_dict()["api_key_last4"] == "test"
    assert "api_key" not in p.safe_dict()


def test_registry_loads_from_json(tmp_path, monkeypatch):
    profiles = [
        {
            "id": "openai_cheap",
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-cheap",
            "model": "gpt-4o-mini",
            "fallback_id": "openai_default",
            "tags": ["cheap"],
        }
    ]
    file = tmp_path / "p.json"
    file.write_text(json.dumps(profiles))
    monkeypatch.setenv("LLM_PROFILES_FILE", str(file))
    monkeypatch.setenv("OPENAI_API_KEY", "sk-default")
    reg = ProfileRegistry.from_env()
    assert reg.get("openai_cheap") is not None
    assert reg.get("openai_default") is not None
    chain = reg.chain("openai_cheap")
    assert [p.id for p in chain] == ["openai_cheap", "openai_default"]


def test_chain_breaks_cycle():
    reg = ProfileRegistry(
        [
            ModelProfile(id="a", fallback_id="b"),
            ModelProfile(id="b", fallback_id="a"),
        ]
    )
    chain = reg.chain("a")
    ids = [p.id for p in chain]
    # 不会无限循环;最多走完不重复的部分
    assert ids[0] == "a"
    assert "a" in ids and "b" in ids
    assert len(ids) == 2
