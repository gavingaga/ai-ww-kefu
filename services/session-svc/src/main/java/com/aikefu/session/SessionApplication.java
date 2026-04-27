package com.aikefu.session;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * session-svc 启动类。
 *
 * <p>负责会话生命周期、状态机、消息幂等存储与历史读取。M1 阶段在内存中实现,M2 起接入 MongoDB
 * 分片集群与 Redis Stream(详见 PRD 06-架构 §4.x、08-数据模型 §2.6/§2.9)。
 */
@SpringBootApplication
public class SessionApplication {

  public static void main(String[] args) {
    SpringApplication.run(SessionApplication.class, args);
  }
}
