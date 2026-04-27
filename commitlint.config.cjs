/**
 * 仓库提交规范 — Conventional Commits。
 * 格式: <type>(<scope>): <subject>
 *   常用 type: feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert
 *   scope 推荐:
 *     repo / prd / exec-plan / proto / ui-glass / design-tokens
 *     web-c / web-agent / web-admin / sdk-jsbridge
 *     gateway-ws / session-svc / routing-svc / agent-bff
 *     ai-hub / llm-router / kb-svc / tool-svc / livectx-svc
 *     notify-svc / upload-svc / audit-svc / report-svc
 *     infra / k8s / observability / ci
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "scope-empty": [1, "never"],
    "subject-empty": [2, "never"],
  },
};
