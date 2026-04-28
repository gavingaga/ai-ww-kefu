package com.aikefu.tool.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.aikefu.tool.clients.LivectxRpc;
import com.aikefu.tool.registry.ToolRegistry;
import com.aikefu.tool.tools.DefaultTools;

@Configuration
public class ToolBeans {

  @Bean
  public ToolRegistry toolRegistry(LivectxRpc livectx) {
    return DefaultTools.register(new ToolRegistry(), livectx);
  }
}
