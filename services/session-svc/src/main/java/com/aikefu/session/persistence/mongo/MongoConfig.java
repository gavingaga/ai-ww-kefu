package com.aikefu.session.persistence.mongo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.IndexOperations;

import com.aikefu.session.domain.Message;
import com.aikefu.session.domain.Session;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;

/**
 * profile=mongo 时启用的 Mongo 配置。手动构造 MongoClient + MongoTemplate,
 * 不依赖 Spring Boot 的 MongoAutoConfiguration(已在 SessionApplication 排除)。
 *
 * <p>启动后注册必要的索引(messages 复合 + sessions 当前用户索引)。
 */
@Configuration
@Profile("mongo")
public class MongoConfig {

  private static final Logger log = LoggerFactory.getLogger(MongoConfig.class);

  @Bean(destroyMethod = "close")
  public MongoClient mongoClient(
      @Value("${spring.data.mongodb.uri:mongodb://localhost:27017/aikefu}") String uri) {
    log.info("session-svc: connecting Mongo {}", uri);
    return MongoClients.create(uri);
  }

  @Bean
  public MongoTemplate mongoTemplate(
      MongoClient client,
      @Value("${spring.data.mongodb.database:aikefu}") String database) {
    return new MongoTemplate(new SimpleMongoClientDatabaseFactory(client, database));
  }

  /** 启动后确保索引存在(幂等)。 */
  @EventListener(ApplicationReadyEvent.class)
  public void ensureIndexes(ApplicationReadyEvent event) {
    MongoTemplate t = event.getApplicationContext().getBean(MongoTemplate.class);
    IndexOperations msg = t.indexOps(Message.class);
    msg.ensureIndex(new Index().on("sessionId", org.springframework.data.domain.Sort.Direction.ASC)
        .on("seq", org.springframework.data.domain.Sort.Direction.DESC)
        .named("msg_session_seq"));
    msg.ensureIndex(new Index().on("sessionId", org.springframework.data.domain.Sort.Direction.ASC)
        .on("clientMsgId", org.springframework.data.domain.Sort.Direction.ASC)
        .unique()
        .sparse()
        .named("msg_session_cmid"));
    IndexOperations ses = t.indexOps(Session.class);
    ses.ensureIndex(new Index().on("tenantId", org.springframework.data.domain.Sort.Direction.ASC)
        .on("userId", org.springframework.data.domain.Sort.Direction.ASC)
        .on("status", org.springframework.data.domain.Sort.Direction.ASC)
        .named("ses_user_status"));
    // 单独的 seq counter 文档集合,保证 nextSeq 原子
    t.indexOps("session_seq")
        .ensureIndex(new Index().on("_id", org.springframework.data.domain.Sort.Direction.ASC));
    log.info("session-svc: Mongo indexes ensured");
  }
}
