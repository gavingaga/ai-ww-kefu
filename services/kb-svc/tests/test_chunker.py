from kb_svc.chunker import ChunkerOpts, chunk_text


def test_short_para_kept_whole():
    out = chunk_text("hello world\n\n你好世界")
    assert out == ["hello world", "你好世界"]


def test_long_para_sliced_with_overlap():
    body = "a" * 1000
    out = chunk_text(body, ChunkerOpts(max_chars=300, overlap=50))
    assert len(out) >= 4
    assert all(len(c) <= 300 for c in out)
    # overlap:相邻 chunk 末尾 / 下一个开头有重叠
    assert out[0][-10:] == out[1][:10]


def test_empty_input():
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []
