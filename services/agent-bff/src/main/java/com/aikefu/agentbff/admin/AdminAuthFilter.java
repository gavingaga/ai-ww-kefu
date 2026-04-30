package com.aikefu.agentbff.admin;

import java.io.IOException;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 管理后台鉴权 filter — 拦截 /v1/admin/* (除登录路由外) 校验 Bearer token,
 * 把 user 与 roles 写入 request 属性,供 controller / 后续 filter / handler 使用。
 *
 * <p>权限维度按角色粗判:
 * <ul>
 *   <li>认证后默认放行所有 /v1/admin/* 读端点(GET);
 *   <li>写端点(POST/PUT/DELETE)需要 {@link Role#OWNER} 或 {@link Role#ADMIN};
 *   <li>更细的端点级别用 {@link RequireRoles} 注解或 controller 内手动 check 覆盖。
 * </ul>
 *
 * <p>不影响非 /v1/admin/* 路径(座席端 /v1/agent / /v1/supervisor 走原 X-Agent-Id 路径)。
 */
@Component
public class AdminAuthFilter extends OncePerRequestFilter {

  public static final String ATTR_USER_ID = "admin.userId";
  public static final String ATTR_ROLES = "admin.roles";
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final AdminJwt jwt;
  private final boolean enabled;

  public AdminAuthFilter(
      AdminJwt jwt,
      @Value("${aikefu.admin.auth.enabled:true}") boolean enabled) {
    this.jwt = jwt;
    this.enabled = enabled;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI();
    // 仅作用于 /v1/admin/*
    if (!path.startsWith("/v1/admin/")) return true;
    // 登录端点放过(需要无 token 也能调)
    if (path.equals("/v1/admin/auth/login")) return true;
    if (path.equals("/v1/admin/auth/logout")) return true;
    return !enabled;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String auth = request.getHeader("Authorization");
    if (auth == null || !auth.startsWith("Bearer ")) {
      writeError(response, 401, "missing token");
      return;
    }
    String token = auth.substring(7);
    Map<String, Object> claims;
    try {
      claims = jwt.decode(token);
    } catch (AdminJwt.InvalidTokenException e) {
      writeError(response, 401, e.getMessage());
      return;
    }
    Object sub = claims.get("sub");
    if (!(sub instanceof Number n)) {
      writeError(response, 401, "no sub");
      return;
    }
    Set<String> roles = parseRoles(claims.get("roles"));

    // 写端点(非 GET)默认要求 owner / admin;controller 内可手动放宽
    String method = request.getMethod();
    boolean isWrite = !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method);
    if (isWrite && !roles.contains(Role.OWNER) && !roles.contains(Role.ADMIN)) {
      writeError(response, 403, "forbidden: write requires admin/owner");
      return;
    }

    request.setAttribute(ATTR_USER_ID, n.longValue());
    request.setAttribute(ATTR_ROLES, roles);
    chain.doFilter(request, response);
  }

  private static Set<String> parseRoles(Object raw) {
    Set<String> out = new LinkedHashSet<>();
    if (raw instanceof Collection<?> c) {
      for (Object o : c) {
        if (o != null) out.add(String.valueOf(o));
      }
    }
    return out;
  }

  private static void writeError(HttpServletResponse resp, int status, String msg) throws IOException {
    resp.setStatus(status);
    resp.setContentType("application/json;charset=utf-8");
    MAPPER.writeValue(resp.getOutputStream(), Map.of("error", msg));
  }

  /** 给 controller 静态方法取当前 user / roles。 */
  public static long currentUserId(HttpServletRequest req) {
    Object v = req.getAttribute(ATTR_USER_ID);
    return v instanceof Number n ? n.longValue() : 0L;
  }

  @SuppressWarnings("unchecked")
  public static Set<String> currentRoles(HttpServletRequest req) {
    Object v = req.getAttribute(ATTR_ROLES);
    return v instanceof Set<?> s ? (Set<String>) s : Set.of();
  }

  public static boolean hasAnyRole(HttpServletRequest req, String... allowed) {
    Set<String> roles = currentRoles(req);
    for (String r : allowed) {
      if (roles.contains(r)) return true;
    }
    return false;
  }

  /** 仅供文档参考的硬编码权限映射,实际由 controller 根据需要调用 {@link #hasAnyRole}。 */
  public static final List<String> ADMIN_LIKE = List.of(Role.OWNER, Role.ADMIN);
}
