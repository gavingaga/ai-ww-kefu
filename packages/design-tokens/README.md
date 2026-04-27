# @ai-kefu/design-tokens

设计令牌 — 色板 / 字号 / 圆角 / 阴影 / 玻璃材质 / 动效。

## 输出

- `import tokens from "@ai-kefu/design-tokens"` — TS 对象,SSR / 测试用
- `import preset from "@ai-kefu/design-tokens/tailwind-preset"` — Tailwind 主题 preset
- `import "@ai-kefu/design-tokens/tokens.css"` — CSS 自定义属性,运行时主题切换

## 主题切换

- 默认跟随系统(`prefers-color-scheme`)
- 强制覆盖:在 `<html>` 上设置 `data-theme="light"` 或 `data-theme="dark"`

## 视觉规范

详见 PRD `02-C端-WebH5-需求.md` §2 视觉与交互规范。
