package com.aikefu.notify;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * notify-svc 启动类。
 *
 * <p>负责公告 / 快捷按钮 / 多级常见问题(FAQ)+ 推送。M2 起步先实现 FAQ 通道(T-213),
 * 公告与快捷按钮在 T-107 / T-114 统一接入。
 */
@SpringBootApplication
public class NotifyApplication {

  public static void main(String[] args) {
    SpringApplication.run(NotifyApplication.class, args);
  }
}
