package com.aikefu.routing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * routing-svc 启动类。
 *
 * <p>负责排队 + 分配 + 技能组 + 坐席状态。M2 起步内存实现,M3 起接 Redis Stream。
 */
@SpringBootApplication
public class RoutingApplication {

  public static void main(String[] args) {
    SpringApplication.run(RoutingApplication.class, args);
  }
}
