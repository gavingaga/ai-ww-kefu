import pytest

from kb_svc.embed import HashEmbedder


@pytest.mark.asyncio
async def test_hash_embedder_dim_and_normalized():
    e = HashEmbedder(dim=384)
    vecs = await e.embed(["你好", "卡顿了"])
    assert len(vecs) == 2
    assert len(vecs[0]) == 384
    # 接近 L2 归一化
    norm = sum(x * x for x in vecs[0]) ** 0.5
    assert 0.9 <= norm <= 1.1


@pytest.mark.asyncio
async def test_hash_embedder_similar_for_overlap():
    e = HashEmbedder()
    a, b, c = await e.embed(["视频卡顿", "卡顿很严重", "怎么取消订阅"])
    sim_ab = sum(x * y for x, y in zip(a, b))
    sim_ac = sum(x * y for x, y in zip(a, c))
    assert sim_ab > sim_ac
