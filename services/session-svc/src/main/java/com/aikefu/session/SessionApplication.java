package com.aikefu.session;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.data.mongo.MongoDataAutoConfiguration;
import org.springframework.boot.autoconfigure.data.mongo.MongoRepositoriesAutoConfiguration;
import org.springframework.boot.autoconfigure.mongo.MongoAutoConfiguration;

/**
 * session-svc 启动类。
 *
 * <p>负责会话生命周期、状态机、消息幂等存储与历史读取。
 *
 * <p>默认 {@code aikefu.session.store=memory} → 内存仓储,此时排除 Spring 的 Mongo 自动配置
 * 不连 Mongo;切换为 {@code mongo} 时由 {@code MongoConfig}(profile=mongo)显式构造
 * {@code MongoTemplate} 与对应 Repository。详见 PRD 06-架构 §4.x、08-数据模型 §2.6/§2.9。
 */
@SpringBootApplication(
    exclude = {
      MongoAutoConfiguration.class,
      MongoDataAutoConfiguration.class,
      MongoRepositoriesAutoConfiguration.class,
    })
public class SessionApplication {

  public static void main(String[] args) {
    SpringApplication.run(SessionApplication.class, args);
  }
}
