package com.aikefu.tool.clients;

import java.time.Duration;

import org.springframework.http.client.SimpleClientHttpRequestFactory;

final class SimpleFactory {
  private SimpleFactory() {}

  static SimpleClientHttpRequestFactory simple(int timeoutMs) {
    SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
    f.setConnectTimeout(Duration.ofMillis(timeoutMs));
    f.setReadTimeout(Duration.ofMillis(timeoutMs));
    return f;
  }
}
