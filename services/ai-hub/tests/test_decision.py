"""决策器单测 — 覆盖 decide() 的全部分支,以及关键词加载策略。

跨路径(handoff / faq / tool / rag / llm)的优先级在 test_paths_priority 里集中。
"""

from ai_hub.decision import (
    DEFAULT_HANDOFF_KEYWORDS,
    Decision,
    _load_keywords,
    decide,
    is_obvious_handoff,
)


# ───── handoff 关键词分支 ─────


def test_keyword_triggers_handoff():
    d = decide("我要投诉这个主播")
    assert d.action == "handoff"
    assert d.reason == "rule_keyword"
    assert d.confidence == 1.0
    assert "投诉" in d.hits


def test_minor_keyword_triggers_handoff():
    d = decide("孩子用我手机偷偷打赏,我是未成年监护人,要退款")
    assert d.action == "handoff"
    assert "未成年" in d.hits or "退款" in d.hits


def test_multiple_keyword_hits_all_recorded():
    """多个关键词都命中时,hits 全部回传给 handoff 包构造方便后续上下文。"""
    d = decide("举报 + 退款 + 涉嫌封禁")
    assert d.action == "handoff"
    assert {"举报", "退款", "封禁"}.issubset(set(d.hits))


def test_keyword_match_is_substring_not_token():
    """中文场景下不分词,关键词存在子串即命中。"""
    d = decide("帮我退款掉这次充值")
    assert d.action == "handoff"
    assert "退款" in d.hits


# ───── llm_general 默认分支 ─────


def test_default_to_llm_general():
    d = decide("怎么把清晰度切到 480p?")
    assert d.action == "llm_general"
    assert d.reason == "default"
    assert d.confidence == 0.5
    assert d.hits == []


def test_empty_input():
    d = decide("")
    assert d.action == "llm_general"
    assert d.reason == "empty input"
    assert d.confidence == 0.0


def test_whitespace_only_input_is_treated_as_empty():
    d = decide("   \n\t  ")
    assert d.action == "llm_general"
    assert d.reason == "empty input"


# ───── 关键词配置覆盖 ─────


def test_decide_accepts_custom_keywords_param():
    """显式传 keywords 应优先于环境变量与默认列表。"""
    d = decide("看视频卡顿怎么办", keywords=("卡顿",))
    assert d.action == "handoff"
    assert d.hits == ["卡顿"]


def test_default_keywords_include_compliance_terms():
    """合规相关关键词必须在默认列表里(PRD 01 §2)。"""
    for k in ("投诉", "退款", "未成年", "举报", "版权", "封禁"):
        assert k in DEFAULT_HANDOFF_KEYWORDS


def test_env_var_overrides_default_keywords(monkeypatch):
    monkeypatch.setenv("AI_HUB_HANDOFF_KEYWORDS", "魔法,封号")
    kws = _load_keywords()
    assert kws == ("魔法", "封号")
    d = decide("我被封号了")
    assert d.action == "handoff"
    assert "封号" in d.hits


def test_env_var_blank_falls_back_to_defaults(monkeypatch):
    monkeypatch.setenv("AI_HUB_HANDOFF_KEYWORDS", "   ")
    assert _load_keywords() == DEFAULT_HANDOFF_KEYWORDS


def test_env_var_strips_whitespace_and_drops_empty(monkeypatch):
    monkeypatch.setenv("AI_HUB_HANDOFF_KEYWORDS", " a , ,b ,, c ")
    assert _load_keywords() == ("a", "b", "c")


# ───── is_obvious_handoff 显式正则 ─────


def test_obvious_handoff_pattern():
    assert is_obvious_handoff("帮我转人工")
    assert is_obvious_handoff("我要投诉")
    assert is_obvious_handoff("帮我退款")
    assert is_obvious_handoff("找客服!")
    assert not is_obvious_handoff("怎么开播")
    assert not is_obvious_handoff("")


# ───── Decision dataclass 行为 ─────


def test_decision_dataclass_immutable():
    d = Decision(action="handoff", reason="r", confidence=1.0, hits=["x"])
    try:
        d.action = "x"  # type: ignore[misc]
    except Exception:
        return
    raise AssertionError("Decision should be frozen")


def test_decision_action_values_match_protocol():
    """ai-hub SSE 协议消费方按 action 分流,值不能漂移。"""
    allowed = {"handoff", "llm_general", "faq", "rag", "tool"}
    assert decide("投诉").action in allowed
    assert decide("普通问题").action in allowed
    assert decide("").action in allowed
