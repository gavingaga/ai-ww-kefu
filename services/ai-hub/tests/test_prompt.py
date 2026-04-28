from ai_hub.prompt import build_messages, render_system, render_with_meta, reset_registry


def setup_function(_):
    reset_registry()


def test_default_template_used_when_no_scene():
    sys = render_system(
        brand="酷播",
        profile={"level": "VIP3"},
        summary="用户咨询卡顿",
    )
    # default 模板含品牌 / 人工 兜底语
    assert "酷播" in sys
    assert "VIP3" in sys
    assert "我帮你转人工" in sys


def test_live_room_template_picked_by_scene():
    sys, tmpl = render_with_meta(
        brand="酷播",
        live_context={"scene": "live_room", "room_id": 8001, "play": {"quality": "1080p"}},
        profile={"level": "VIP3"},
    )
    assert tmpl.scene == "live_room"
    assert tmpl.version >= 1
    # live_room 模板要求强制工具调用
    assert "get_play_diagnostics" in sys
    assert "1080p" in sys


def test_vod_detail_template_picked_by_scene():
    _, tmpl = render_with_meta(
        live_context={"scene": "vod_detail", "vod_id": 999},
    )
    assert tmpl.scene == "vod_detail"


def test_anchor_console_template_picked_by_scene():
    _, tmpl = render_with_meta(
        live_context={"scene": "anchor_console"},
    )
    assert tmpl.scene == "anchor_console"


def test_unknown_scene_falls_back_to_default():
    _, tmpl = render_with_meta(
        live_context={"scene": "no_such_scene_xyz"},
    )
    assert tmpl.scene == "default"


def test_build_messages_filters_invalid_roles():
    history = [
        {"role": "user", "content": "你好"},
        {"role": "tool", "content": "should-be-dropped"},
        {"role": "assistant", "content": "在的"},
        {"role": "user", "content": "  "},  # 空内容过滤
    ]
    msgs = build_messages(user_text="为什么卡顿", history=history, system_text="SYS")
    roles = [m["role"] for m in msgs]
    assert roles[0] == "system"
    assert "tool" not in roles
    assert msgs[-1] == {"role": "user", "content": "为什么卡顿"}
    contents = [m["content"] for m in msgs]
    assert "  " not in contents


# ───── 场景路由更深的边界 ─────


def test_report_flow_template_picked_by_scene():
    """补齐已打包的全部 scene 路由覆盖。"""
    _, tmpl = render_with_meta(live_context={"scene": "report_flow"})
    assert tmpl.scene == "report_flow"


def test_scene_lookup_is_case_insensitive():
    """前端 / SDK 可能传 LIVE_ROOM(老链路),应归一化。"""
    _, tmpl = render_with_meta(live_context={"scene": "LIVE_ROOM"})
    assert tmpl.scene == "live_room"


def test_scene_lookup_strips_whitespace_and_falls_back():
    """注册表 get() 对纯空白 scene 走 default(避免 dirty input 命中失败)。"""
    _, tmpl = render_with_meta(live_context={"scene": "   "})
    assert tmpl.scene == "default"


def test_non_string_scene_falls_back_to_default():
    """live_context.scene 非 string 时也要退到 default。"""
    _, tmpl = render_with_meta(live_context={"scene": 12345})  # type: ignore[dict-item]
    assert tmpl.scene == "default"


def test_explicit_scene_param_overrides_live_context():
    """显式 scene= 参数胜过 live_context.scene。"""
    _, tmpl = render_with_meta(
        scene="vod_detail",
        live_context={"scene": "live_room"},
    )
    assert tmpl.scene == "vod_detail"


def test_unknown_version_falls_back_to_max():
    """请求不存在的 version 时,应回到该 scene 的最大版本而不是抛错。"""
    _, tmpl = render_with_meta(live_context={"scene": "default"}, version=999)
    assert tmpl.scene == "default"
    assert tmpl.version >= 1


def test_render_substitutes_all_six_variables():
    """模板里的 6 个 format 变量都应该被替换成实际值。"""
    body, _ = render_with_meta(
        brand="酷播",
        profile={"level": "VIP3", "name": "测试用户"},
        live_context={"scene": "default", "room_id": 8001},
        summary="历史摘要",
        tool_results={"diag": {"buffer_count": 3}},
        rag_chunks="[卡顿排查] 切到 480p。",
    )
    # 没有未替换的 {var} 占位
    for placeholder in (
        "{brand}",
        "{profile_json}",
        "{live_context_json}",
        "{summary}",
        "{tool_results_json}",
        "{rag_chunks}",
    ):
        assert placeholder not in body, f"placeholder {placeholder} 未被替换"
    assert "酷播" in body
    assert "VIP3" in body
    assert "8001" in body
    assert "历史摘要" in body
    assert "buffer_count" in body
    assert "卡顿排查" in body


def test_render_uses_placeholder_for_blank_summary_and_rag():
    """summary / rag_chunks 留空时应展示「(无)」占位。"""
    body, _ = render_with_meta()
    assert "(无)" in body


def test_render_keeps_cjk_unescaped_in_json_blocks():
    """profile/live_context JSON 序列化要保留中文,而不是转义成 \\uXXXX。"""
    body, _ = render_with_meta(profile={"name": "测试用户"})
    assert "测试用户" in body
    assert "\\u6d4b" not in body


def test_render_unhashable_value_does_not_crash():
    """profile 里塞了不可序列化对象时,内部 _json 兜底返回 '{}',不抛 500。"""
    body, _ = render_with_meta(profile={"weird": object()})
    # 模板正常渲染 + 没有 {profile_json} 占位残留
    assert "{profile_json}" not in body


def test_render_system_alias_returns_same_body():
    """render_system 是 render_with_meta 的便捷别名。"""
    body_a = render_system(live_context={"scene": "live_room"})
    body_b, _ = render_with_meta(live_context={"scene": "live_room"})
    assert body_a == body_b


# ───── 注册表加载与外部覆盖的边界 ─────


def test_external_dir_can_register_new_scene(tmp_path, monkeypatch):
    """ENV 目录里加一个全新 scene,应可被路由命中(运营自助上线 prompt 的口子)。"""
    (tmp_path / "membership_payment__1.md").write_text(
        "# 会员通道 v1\n你是会员客服,brand={brand},profile={profile_json},"
        "live={live_context_json},sum={summary},tools={tool_results_json},rag={rag_chunks}\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path))
    reset_registry()
    body, tmpl = render_with_meta(
        live_context={"scene": "membership_payment"},
        brand="酷播",
    )
    assert tmpl.scene == "membership_payment"
    assert tmpl.source.startswith("fs:")
    assert "你是会员客服" in body
    assert "brand=酷播" in body


def test_external_dir_overrides_builtin_when_higher_version(tmp_path, monkeypatch):
    """同 scene 时,ENV 提供的更高版本应胜过 builtin。"""
    (tmp_path / "default__99.md").write_text("# default v99\nOVERRIDE", encoding="utf-8")
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path))
    reset_registry()
    _, tmpl = render_with_meta()
    assert tmpl.version == 99
    assert tmpl.source.startswith("fs:")


def test_external_dir_lower_version_does_not_replace_builtin(tmp_path, monkeypatch):
    """ENV 目录的旧版本不应"覆盖"内置,因为查询走 max(version)。"""
    (tmp_path / "default__0.md").write_text("# v0\nOLD", encoding="utf-8")
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path))
    reset_registry()
    _, tmpl = render_with_meta()
    assert tmpl.version >= 1, "应走 builtin v1+,不应回到 ENV v0"


def test_explicit_scene_with_explicit_version_pins_template(tmp_path, monkeypatch):
    """灰度回滚:可同时指定 scene + version 锁到一个固定模板。"""
    (tmp_path / "default__2.md").write_text("# default v2\n=== V2 ===", encoding="utf-8")
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path))
    reset_registry()
    _, tmpl = render_with_meta(scene="default", version=1)
    assert tmpl.version == 1
    body, _ = render_with_meta(scene="default", version=2)
    assert "=== V2 ===" in body


def test_bad_filename_is_skipped(tmp_path, monkeypatch):
    """不符合 <scene>__<version>.md 命名的文件应被忽略,不抛异常。"""
    (tmp_path / "bogus.md").write_text("# x\nignored", encoding="utf-8")
    (tmp_path / "live_room_2.md").write_text("# 错的_单下划线\nx", encoding="utf-8")
    (tmp_path / "default__7.md").write_text("# good\nOK", encoding="utf-8")
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path))
    reset_registry()
    _, tmpl = render_with_meta()
    assert tmpl.version >= 7  # 至少把合法的那条认了
    body, _ = render_with_meta(scene="default", version=7)
    assert body.strip() == "OK"


def test_template_title_parsed_from_first_line(tmp_path, monkeypatch):
    """首行 `# 标题` 被剥离当 title,正文不应再含这一行。"""
    (tmp_path / "vod_detail__9.md").write_text(
        "# 点播详情·v9\n这是正文 {brand}\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path))
    reset_registry()
    body, tmpl = render_with_meta(brand="X", scene="vod_detail")
    assert tmpl.title == "点播详情·v9"
    assert "点播详情·v9" not in body
    assert body.strip() == "这是正文 X"


def test_missing_dir_does_not_crash(tmp_path, monkeypatch):
    """ENV 指向不存在的目录不应让 ai-hub 启动失败。"""
    monkeypatch.setenv("AI_HUB_PROMPTS_DIR", str(tmp_path / "nope"))
    reset_registry()
    _, tmpl = render_with_meta()
    assert tmpl.scene == "default"
