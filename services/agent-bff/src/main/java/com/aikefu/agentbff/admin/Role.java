package com.aikefu.agentbff.admin;

/**
 * 内置角色 — String 比 enum 更易扩展(后续支持自定义角色),这里用常量约束初始集合。
 *
 * <p>默认权限粒度(单租户):
 * <ul>
 *   <li>{@link #OWNER} 全权,含密钥配置 / 用户邀请 / 角色授予。
 *   <li>{@link #ADMIN} 除 owner 私有(签发新 owner / 改 jwt secret)外,管理范围全权。
 *   <li>{@link #SUPERVISOR} 干预运行时(observe / whisper / steal / transfer)+ 报表只读。
 *   <li>{@link #AGENT} 接入会话、回复、转接;不能改组织配置。
 *   <li>{@link #VIEWER} 报表 / 审计只读。
 *   <li>{@link #DEVELOPER} prompt / llm-profile / kb / faq / decision 配置。
 * </ul>
 */
public final class Role {
  public static final String OWNER = "owner";
  public static final String ADMIN = "admin";
  public static final String SUPERVISOR = "supervisor";
  public static final String AGENT = "agent";
  public static final String VIEWER = "viewer";
  public static final String DEVELOPER = "developer";

  private Role() {}
}
