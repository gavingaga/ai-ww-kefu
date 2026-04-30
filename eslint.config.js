// 仓根 ESLint flat config — 给 lint-staged 在仓根跑 eslint --fix 用。
// 各 app 仍可在自己目录下放 eslint.config.js 自定义,但 lint-staged 会用此根配置。
import config from "@ai-kefu/eslint-config/react";

export default [
  ...config,
  {
    // 仅 lint 应用源码与服务端 TS;node_modules / dist / build 自然忽略。
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/target/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/*.min.*",
      "services/**/*.go",
    ],
  },
];
