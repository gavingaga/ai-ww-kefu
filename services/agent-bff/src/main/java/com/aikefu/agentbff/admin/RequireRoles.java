package com.aikefu.agentbff.admin;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标注 controller 方法需要的角色集合(任一命中即放行)— 由 {@code AdminAuthFilter} 检查不到的细粒度路径用。
 *
 * <p>当前实现仅作"自描述",不直接被 Spring 拾起;controller 方法内手动 {@code AdminAuthFilter.hasAnyRole}
 * 校验。后续可加 HandlerInterceptor 自动读取此注解再判断。
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD, ElementType.TYPE})
public @interface RequireRoles {
  String[] value();
}
