package com.aikefu.agentbff;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * agent-bff 启动类。
 *
 * <p>座席工作台 BFF — 聚合 routing-svc(队列 / 派单)、session-svc(会话状态机 / 历史)与
 * notify-svc(快捷短语 / FAQ),给 web-agent 提供精简的统一接口。
 */
@SpringBootApplication
@EnableScheduling
public class AgentBffApplication {

  public static void main(String[] args) {
    SpringApplication.run(AgentBffApplication.class, args);
  }
}
