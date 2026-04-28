from ai_hub.decision import Decision, decide, is_obvious_handoff


def test_keyword_triggers_handoff():
    d = decide("我要投诉这个主播")
    assert d.action == "handoff"
    assert "投诉" in d.hits


def test_minor_keyword_triggers_handoff():
    d = decide("孩子用我手机偷偷打赏,我是未成年监护人,要退款")
    assert d.action == "handoff"
    assert "未成年" in d.hits or "退款" in d.hits


def test_default_to_llm_general():
    d = decide("怎么把清晰度切到 480p?")
    assert d.action == "llm_general"
    assert d.hits == []


def test_empty_input():
    d = decide("")
    assert d.action == "llm_general"


def test_obvious_handoff_pattern():
    assert is_obvious_handoff("帮我转人工")
    assert is_obvious_handoff("我要投诉")
    assert not is_obvious_handoff("怎么开播")


def test_decision_dataclass_immutable():
    d = Decision(action="handoff", reason="r", confidence=1.0, hits=["x"])
    try:
        d.action = "x"  # type: ignore[misc]
    except Exception:
        return
    raise AssertionError("Decision should be frozen")
