"""kb-svc FastAPI 端点集成测试 — 走 HashEmbedder + 默认种子。"""

from fastapi.testclient import TestClient

from kb_svc.main import create_app


def make_client():
    return TestClient(create_app(auto_seed=True))


def test_healthz_and_stats():
    c = make_client()
    h = c.get("/healthz")
    assert h.status_code == 200
    assert h.json()["chunks"] > 0
    s = c.get("/v1/kb/stats")
    assert s.status_code == 200
    body = s.json()
    assert body["chunks"] > 0
    assert "default" in body["by_kb"]


def test_search_endpoint_returns_buffer_doc_for_buffer_query():
    c = make_client()
    r = c.post("/v1/kb/search", json={"query": "视频卡顿怎么办", "top_k": 3})
    assert r.status_code == 200
    hits = r.json()["hits"]
    assert hits
    titles = [h["title"] for h in hits]
    assert any("卡顿" in t for t in titles)


def test_match_endpoint_renders_chunks():
    c = make_client()
    r = c.post("/v1/kb/match", json={"query": "未成年人退款怎么办", "top_k": 2})
    assert r.status_code == 200
    body = r.json()
    assert body["hit"] is True
    assert "未成年" in body["rendered"]
    assert body["chunks"]


def test_debug_search_returns_per_route_scores():
    c = make_client()
    r = c.post(
        "/v1/kb/debug/search",
        json={"query": "视频卡顿怎么办", "top_k": 3, "vector_top": 10, "bm25_top": 10},
    )
    assert r.status_code == 200
    body = r.json()
    # 每路至少有一个候选,且字段齐全
    assert body["store_size"] > 0
    assert body["opts"]["top_k"] == 3
    assert body["vector"], "vector route empty"
    assert body["bm25"], "bm25 route empty"
    assert body["rrf"], "rrf empty"
    assert body["rerank"], "rerank empty"
    assert body["hits"], "final hits empty"
    first = body["rerank"][0]
    for k in ("chunk_id", "title", "vector_score", "bm25_score", "rrf_score", "rerank_score", "final_score"):
        assert k in first, f"missing key {k} in rerank entry"
    # 卡顿这种关键词,顶部至少一条标题相关
    titles = [d["title"] for d in body["rerank"]]
    assert any("卡顿" in t for t in titles)


def test_debug_search_empty_query_400():
    c = make_client()
    r = c.post("/v1/kb/debug/search", json={"query": "  "})
    assert r.status_code == 400


def test_list_docs_returns_aggregated_rows():
    c = make_client()
    body = c.get("/v1/kb/docs").json()
    assert body["total"] >= 1
    assert any("doc_id" in r and "chunks" in r and r["chunks"] >= 1 for r in body["items"])


def test_delete_doc_removes_all_chunks_and_404_on_repeat():
    c = make_client()
    # 先 ingest 一个一次性文档
    c.post(
        "/v1/kb/ingest",
        json={
            "id": "doc_to_delete",
            "kb_id": "default",
            "title": "临时",
            "body": "这是一段会被删除的内容。" * 5,
        },
    )
    r = c.delete("/v1/kb/docs/doc_to_delete")
    assert r.status_code == 200
    assert r.json()["deleted_chunks"] >= 1
    # 二次删除 → 404
    assert c.delete("/v1/kb/docs/doc_to_delete").status_code == 404


def test_reindex_doc_updates_embeddings():
    c = make_client()
    c.post(
        "/v1/kb/ingest",
        json={
            "id": "doc_reindex",
            "kb_id": "default",
            "title": "重嵌入用",
            "body": "测试重嵌入流程的占位文本。",
        },
    )
    r = c.post("/v1/kb/docs/doc_reindex/reindex")
    assert r.status_code == 200
    assert r.json()["reindexed"] >= 1


def test_ingest_then_search():
    c = make_client()
    c.post(
        "/v1/kb/ingest",
        json={
            "id": "doc_emoji_policy",
            "kb_id": "default",
            "title": "弹幕表情管理",
            "body": "本平台允许使用平台内置表情;Unicode 颜文字按规则过滤。",
            "metadata": {"category": "social"},
        },
    )
    r = c.post("/v1/kb/match", json={"query": "弹幕表情怎么用", "top_k": 1})
    body = r.json()
    assert body["hit"] is True
    assert "弹幕" in body["rendered"]
