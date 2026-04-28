package com.aikefu.notify.faq.match;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TokenizerTest {

  @Test
  void cjkSplitsByChar() {
    var t = Tokenizer.tokenize("视频卡顿");
    assertThat(t).containsExactlyInAnyOrder("视", "频", "卡", "顿");
  }

  @Test
  void mixedCjkAndAscii() {
    var t = Tokenizer.tokenize("切到 480p 试试");
    assertThat(t).contains("切", "到", "480p", "试");
  }

  @Test
  void overlapCoefHigherThanJaccardForShortQuery() {
    var q = Tokenizer.tokenize("卡顿");
    var leaf = Tokenizer.tokenize("我看视频卡顿怎么办");
    assertThat(Tokenizer.overlapCoef(q, leaf)).isEqualTo(1.0);
    assertThat(Tokenizer.jaccard(q, leaf)).isLessThan(1.0);
  }

  @Test
  void emptyInput() {
    assertThat(Tokenizer.tokenize("")).isEmpty();
    assertThat(Tokenizer.tokenize("  ")).isEmpty();
  }
}
