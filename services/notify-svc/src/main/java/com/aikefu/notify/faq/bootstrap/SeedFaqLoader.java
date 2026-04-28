package com.aikefu.notify.faq.bootstrap;

import java.io.InputStream;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.aikefu.notify.faq.domain.FaqTree;
import com.aikefu.notify.faq.service.FaqService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 启动时把 classpath:seeds/faq-default.json 装载到内存仓储,作为 M1/M2 阶段的默认 FAQ 树。
 *
 * <p>若同 scene 已存在,跳过(允许后续 admin 修改不被启动覆盖)。
 */
@Component
public class SeedFaqLoader implements CommandLineRunner {

  private static final Logger log = LoggerFactory.getLogger(SeedFaqLoader.class);

  private final FaqService faq;
  private final String resource;
  private final ObjectMapper mapper = new ObjectMapper();

  public SeedFaqLoader(
      FaqService faq, @Value("${aikefu.faq.seed-resource:seeds/faq-default.json}") String resource) {
    this.faq = faq;
    this.resource = resource;
  }

  @Override
  public void run(String... args) throws Exception {
    var res = new ClassPathResource(resource);
    if (!res.exists()) {
      log.warn("seed faq resource not found: {}", resource);
      return;
    }
    try (InputStream in = res.getInputStream()) {
      List<FaqTree> trees = mapper.readValue(in, new TypeReference<List<FaqTree>>() {});
      for (FaqTree t : trees) {
        if (faq.getTree(t.getScene()).isPresent()) {
          log.info("seed: skip existing scene={}", t.getScene());
          continue;
        }
        faq.saveTree(t);
        log.info("seed: loaded faq scene={} version={}", t.getScene(), t.getVersion());
      }
    }
  }
}
