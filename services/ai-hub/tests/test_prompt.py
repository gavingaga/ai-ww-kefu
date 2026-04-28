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
