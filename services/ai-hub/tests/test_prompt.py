from ai_hub.prompt import build_messages, render_system


def test_system_includes_brand_and_live_context():
    sys = render_system(
        brand="酷播",
        live_context={"scene": "live_room", "room_id": 8001, "play": {"quality": "1080p"}},
        profile={"level": "VIP3"},
        summary="用户咨询卡顿",
    )
    assert "酷播" in sys
    assert "live_room" in sys
    assert "1080p" in sys
    assert "VIP3" in sys
    assert "卡顿建议 ≤ 3 步" in sys


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
