# @ai-kefu/ui-glass

Glassmorphism 共享组件库 — C 端、座席台 通用。

## 已含组件(M0 起步)

| 组件 | 用途 |
|------|------|
| `GlassCard` | 玻璃材质容器 |
| `Bubble` | 消息气泡(user / ai / agent / system),AI 支持 thinking 呼吸光 |
| `Avatar` | 头像,可开启呼吸边框(AI 状态) |
| `Capsule` | 胶囊按钮(快捷按钮 / 输入区) |
| `MarqueeBar` | 顶部公告跑马灯,rAF 实现,后台 tab 暂停,critical 红底 |
| `FaqNode` | 单个 FAQ 列表项(分类 / 叶子) |

## 使用

```ts
import "@ai-kefu/design-tokens/tokens.css";
import { GlassCard, Bubble, MarqueeBar } from "@ai-kefu/ui-glass";
```

后续 Story 还会加入: 输入区、未读提示、播放诊断卡、直播间快照卡、会员订阅卡、表单卡、Storybook(M0 末)。

## 视觉与交互规范

详见 PRD `02-C端-WebH5-需求.md` §2 / §3。
