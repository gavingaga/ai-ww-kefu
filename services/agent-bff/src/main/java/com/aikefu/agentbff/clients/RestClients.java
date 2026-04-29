package com.aikefu.agentbff.clients;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** 给两个下游服务各注入一个 RestClient。 */
@Configuration
public class RestClients {

  @Bean(name = "routingRestClient")
  public RestClient routingRestClient(
      @Value("${aikefu.routing-svc.url:http://localhost:8083}") String baseUrl,
      @Value("${aikefu.routing-svc.timeout-ms:2000}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  @Bean(name = "sessionRestClient")
  public RestClient sessionRestClient(
      @Value("${aikefu.session-svc.url:http://localhost:8081}") String baseUrl,
      @Value("${aikefu.session-svc.timeout-ms:3000}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  @Bean(name = "kbRestClient")
  public RestClient kbRestClient(
      @Value("${aikefu.kb-svc.url:http://localhost:8092}") String baseUrl,
      @Value("${aikefu.kb-svc.timeout-ms:5000}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  @Bean(name = "notifyRestClient")
  public RestClient notifyRestClient(
      @Value("${aikefu.notify-svc.url:http://localhost:8082}") String baseUrl,
      @Value("${aikefu.notify-svc.timeout-ms:3000}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  @Bean(name = "auditRestClient")
  public RestClient auditRestClient(
      @Value("${aikefu.audit-svc.url:http://localhost:8085}") String baseUrl,
      @Value("${aikefu.audit-svc.timeout-ms:1500}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  @Bean(name = "reportRestClient")
  public RestClient reportRestClient(
      @Value("${aikefu.report-svc.url:http://localhost:8089}") String baseUrl,
      @Value("${aikefu.report-svc.timeout-ms:2000}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  @Bean(name = "toolRestClient")
  public RestClient toolRestClient(
      @Value("${aikefu.tool-svc.url:http://localhost:8087}") String baseUrl,
      @Value("${aikefu.tool-svc.timeout-ms:5000}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  @Bean(name = "aiHubRestClient")
  public RestClient aiHubRestClient(
      @Value("${aikefu.ai-hub.url:http://localhost:8091}") String baseUrl,
      @Value("${aikefu.ai-hub.timeout-ms:8000}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  @Bean(name = "llmRouterRestClient")
  public RestClient llmRouterRestClient(
      @Value("${aikefu.llm-router.url:http://localhost:8090}") String baseUrl,
      @Value("${aikefu.llm-router.timeout-ms:5000}") int timeoutMs) {
    return RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(factory(timeoutMs))
        .build();
  }

  private static SimpleClientHttpRequestFactory factory(int timeoutMs) {
    SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
    f.setConnectTimeout(Duration.ofMillis(timeoutMs));
    f.setReadTimeout(Duration.ofMillis(timeoutMs));
    return f;
  }
}
