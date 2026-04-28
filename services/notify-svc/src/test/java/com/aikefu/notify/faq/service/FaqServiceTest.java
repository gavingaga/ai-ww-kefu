package com.aikefu.notify.faq.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.aikefu.notify.faq.domain.FaqAnswer;
import com.aikefu.notify.faq.domain.FaqNode;
import com.aikefu.notify.faq.domain.FaqTree;
import com.aikefu.notify.faq.persistence.InMemoryFaqRepository;

class FaqServiceTest {

  private FaqService svc;

  @BeforeEach
  void setUp() {
    svc = new FaqService(new InMemoryFaqRepository(), 0.86, 0.55);
    svc.saveTree(seed());
  }

  private FaqTree seed() {
    return FaqTree.builder()
        .id("t1")
        .scene("welcome")
        .nodes(
            List.of(
                FaqNode.builder()
                    .id("play")
                    .title("播放")
                    .children(
                        List.of(
                            FaqNode.builder()
                                .id("buffer")
                                .title("我看视频卡顿怎么办?")
                                .isLeaf(true)
                                .synonyms(List.of("卡顿", "好卡", "缓冲"))
                                .answer(FaqAnswer.builder().contentMd("切到 480p 试试").build())
                                .build(),
                            FaqNode.builder()
                                .id("quality")
                                .title("如何切换清晰度?")
                                .isLeaf(true)
                                .synonyms(List.of("清晰度", "画质"))
                                .answer(FaqAnswer.builder().contentMd("点右下角清晰度按钮").build())
                                .build()))
                    .build(),
                FaqNode.builder()
                    .id("ms")
                    .title("会员")
                    .children(
                        List.of(
                            FaqNode.builder()
                                .id("cancel")
                                .title("怎么取消连续包月?")
                                .isLeaf(true)
                                .synonyms(List.of("取消订阅", "退订"))
                                .answer(FaqAnswer.builder().contentMd("到设置 → 订阅关闭").build())
                                .build()))
                    .build()))
        .build();
  }

  @Test
  void getTreeByScene() {
    assertThat(svc.getTree("welcome")).isPresent();
    assertThat(svc.getTree("nope")).isEmpty();
  }

  @Test
  void exactMatchTitle() {
    var m = svc.match("我看视频卡顿怎么办?");
    assertThat(m.isHit()).isTrue();
    assertThat(m.getHow()).isEqualTo("exact");
    assertThat(m.getNode().getId()).isEqualTo("buffer");
  }

  @Test
  void exactMatchSynonym() {
    var m = svc.match("退订");
    assertThat(m.isHit()).isTrue();
    assertThat(m.getHow()).isEqualTo("exact");
    assertThat(m.getNode().getId()).isEqualTo("cancel");
  }

  @Test
  void similarMatchHighOverlapHits() {
    var m = svc.match("视频好卡");
    assertThat(m.isHit()).isTrue();
    assertThat(m.getHow()).isEqualTo("similar");
    assertThat(m.getNode().getId()).isEqualTo("buffer");
    assertThat(m.getScore()).isGreaterThanOrEqualTo(0.55);
  }

  @Test
  void noMatchBelowThreshold() {
    var m = svc.match("我想咨询主播签约");
    assertThat(m.isHit()).isFalse();
  }

  @Test
  void hitCountIncrements() {
    svc.recordHit("buffer");
    svc.recordHit("buffer");
    assertThat(svc.hitCount("buffer")).isEqualTo(2);
  }

  @Test
  void getChildrenReturnsCategoryChildren() {
    var children = svc.getChildren("play");
    assertThat(children).hasSize(2);
  }

  @Test
  void saveTreeBumpsVersion() {
    var v1 = svc.getTree("welcome").map(FaqTree::getVersion).orElse(0);
    svc.saveTree(seed());
    var v2 = svc.getTree("welcome").map(FaqTree::getVersion).orElse(0);
    assertThat(v2).isGreaterThan(v1);
  }
}
