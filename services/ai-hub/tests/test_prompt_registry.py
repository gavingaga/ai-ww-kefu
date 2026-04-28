"""测试 PromptRegistry 内置模板装载与 ENV 目录覆盖。"""

from __future__ import annotations

from ai_hub.prompts.registry import PromptRegistry


def test_builtin_loads_all_scenes():
    reg = PromptRegistry.from_default()
    scenes = {t.scene for t in reg.all()}
    assert {"default", "live_room", "vod_detail", "anchor_console", "report_flow"} <= scenes


def test_max_version_chosen():
    reg = PromptRegistry.from_default()
    t = reg.get("default")
    assert t.scene == "default"
    assert t.version >= 1


def test_unknown_scene_falls_back_to_default():
    reg = PromptRegistry.from_default()
    t = reg.get("not_exists")
    assert t.scene == "default"


def test_external_dir_override(tmp_path, monkeypatch):
    p = tmp_path / "default__99.md"
    p.write_text("# default v99\nHELLO {brand}", encoding="utf-8")
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path))
    reg = PromptRegistry.from_default()
    t = reg.get("default")
    assert t.version == 99
    assert "HELLO" in t.body


def test_explicit_version_request(tmp_path, monkeypatch):
    (tmp_path / "default__7.md").write_text("# v7\nA", encoding="utf-8")
    (tmp_path / "default__9.md").write_text("# v9\nB", encoding="utf-8")
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path))
    reg = PromptRegistry.from_default()
    assert reg.get("default", version=7).version == 7
    assert reg.get("default").version == 9  # 默认取最高
