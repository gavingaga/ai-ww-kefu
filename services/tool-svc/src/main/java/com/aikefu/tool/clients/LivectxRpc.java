package com.aikefu.tool.clients;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** livectx-svc 客户端 — 失败返 null,不阻塞工具执行。 */
@Component
public class LivectxRpc {

  private static final Logger LOG = LoggerFactory.getLogger(LivectxRpc.class);
  private final RestClient client;

  public LivectxRpc(
      @Value("${aikefu.livectx-svc.url:http://localhost:8086}") String baseUrl,
      @Value("${aikefu.livectx-svc.timeout-ms:1500}") int timeoutMs) {
    this.client = RestClient.builder()
        .baseUrl(baseUrl)
        .requestFactory(SimpleFactory.simple(timeoutMs))
        .build();
  }

  public Map<String, Object> resolve(String scene, Long roomId, Long vodId, Long uid) {
    if (scene == null || scene.isBlank()) return null;
    StringBuilder qs = new StringBuilder("/v1/live/context?scene=").append(scene);
    if (roomId != null) qs.append("&room_id=").append(roomId);
    if (vodId != null) qs.append("&vod_id=").append(vodId);
    if (uid != null) qs.append("&uid=").append(uid);
    try {
      return client.get().uri(qs.toString()).retrieve()
          .body(new ParameterizedTypeReference<>() {});
    } catch (Exception e) {
      LOG.debug("livectx resolve failed: {}", e.toString());
      return null;
    }
  }
}
