from kb_svc.bm25 import BM25Index


def test_bm25_returns_relevant_first():
    bm = BM25Index()
    bm.add("我看视频卡顿怎么办,建议切到 480p")
    bm.add("怎么取消连续包月")
    bm.add("举报涉黄内容,30 分钟内介入")
    res = bm.search("卡顿 切清晰度", top_k=2)
    assert res
    # 第一条应当是卡顿那条
    assert res[0][0] == 0


def test_bm25_no_match_returns_empty():
    bm = BM25Index()
    bm.add("a b c d")
    assert bm.search("xyz") == []
