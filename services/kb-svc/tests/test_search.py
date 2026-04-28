"""Hybrid 检索集成测试 — 使用 HashEmbedder 不打外网。"""

import pytest

from kb_svc.embed import HashEmbedder
from kb_svc.ingest import ingest_document
from kb_svc.models import Document
from kb_svc.search import SearchOpts, hybrid_search
from kb_svc.store import ChunkStore


@pytest.mark.asyncio
async def test_search_finds_buffer_doc_for_buffer_query():
    store = ChunkStore()
    e = HashEmbedder()
    docs = [
        Document(
            id="doc_buffer",
            kb_id="default",
            title="卡顿排查标准答复",
            body="卡顿建议:切到 480p、切换 Wi-Fi、退出直播间重新进入。常见错误码 NET-1003 / CDN-5xx / AUTH-401。",
        ),
        Document(
            id="doc_subscription",
            kb_id="default",
            title="会员订阅与连续包月",
            body="iOS 在设置 Apple ID 取消订阅;Android 在 Play 商店取消。",
        ),
        Document(
            id="doc_minor",
            kb_id="default",
            title="未成年人退款流程",
            body="提供监护人身份证 + 户口本 + 充值订单截图。7 个工作日内书面答复。",
        ),
    ]
    for d in docs:
        await ingest_document(doc=d, store=store, embedder=e)
    hits = await hybrid_search(
        store=store, embedder=e, query="视频卡顿怎么办", opts=SearchOpts(top_k=3)
    )
    assert hits
    assert hits[0].chunk.doc_id == "doc_buffer"
    # 多路分都被填上
    assert hits[0].vector_score > 0
    assert hits[0].rerank_score > 0


@pytest.mark.asyncio
async def test_search_kb_id_filter():
    store = ChunkStore()
    e = HashEmbedder()
    await ingest_document(
        doc=Document(id="d1", kb_id="A", title="卡顿建议", body="切到 480p"),
        store=store,
        embedder=e,
    )
    await ingest_document(
        doc=Document(id="d2", kb_id="B", title="卡顿无关", body="切到 480p"),
        store=store,
        embedder=e,
    )
    hits = await hybrid_search(
        store=store, embedder=e, query="卡顿", opts=SearchOpts(kb_id="A", top_k=5)
    )
    assert all(h.chunk.kb_id == "A" for h in hits)


@pytest.mark.asyncio
async def test_search_empty_query_returns_nothing():
    store = ChunkStore()
    e = HashEmbedder()
    await ingest_document(
        doc=Document(id="d1", kb_id="A", title="t", body="x"), store=store, embedder=e
    )
    hits = await hybrid_search(store=store, embedder=e, query="")
    assert hits == []
