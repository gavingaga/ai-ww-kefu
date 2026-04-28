package com.aikefu.notify;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.aikefu.notify.faq.service.FaqService;

@SpringBootTest
class NotifyApplicationTests {

  @Autowired private FaqService faq;

  @Test
  void seedFaqLoadsOnStartup() {
    var tree = faq.getTree("welcome");
    assertThat(tree).isPresent();
    assertThat(tree.get().getNodes()).isNotEmpty();
  }

  @Test
  void seedFaqMatchesPlayKeyword() {
    var m = faq.match("我看视频卡顿");
    assertThat(m.isHit()).isTrue();
  }
}
