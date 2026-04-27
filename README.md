# ai-kefu

直播 / 点播业务的「AI 优先 + 人工兜底」客服系统 — Monorepo。

## 文档

- 产品需求(PRD): [`docs/prd/`](docs/prd/)
- 执行计划: [`docs/exec-plan/`](docs/exec-plan/)

## 仓库结构

```
apps/        前端应用 (web-c / web-agent / web-admin / sdk-jsbridge)
packages/    共享包 (proto / ui-glass / design-tokens / eslint-config)
services/    后端微服务 (gateway-ws / session-svc / ai-hub / ...)
infra/       基础设施 (k8s / terraform / observability)
tests/       e2e / load / chaos / security
tools/       开发辅助 (ws-mock / business-mock)
docs/        PRD 与执行计划
```

## 工具链

- Node 20+ / pnpm 9+ — 前端 & TS 共享包
- JDK 21 / Maven 3.9+ — Java 后端服务
- Python 3.11+ / uv — AI 相关服务
- Docker + Kubernetes — 运行时

## 常用命令

```bash
# 安装所有 JS 依赖
pnpm i

# 构建所有 JS 包/应用
pnpm build

# 起所有 dev 服务(并行)
pnpm dev

# 跑全部 lint
pnpm lint

# 跑全部测试
pnpm test
```

## 贡献

提交规范: [Conventional Commits](https://www.conventionalcommits.org/)。
