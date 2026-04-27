# @ai-kefu/web-c

C 端 Web H5 — 直播 / 点播业务客服。单页 React 应用,自适应 PC + Mobile + WebView。

## 启动

```bash
# 仓库根
pnpm i
pnpm proto:gen   # 生成 @ai-kefu/proto 的 dist/ts/

# 起 dev
pnpm --filter @ai-kefu/web-c dev
# 浏览器打开 http://localhost:5173
```

## 当前进度(T-109)

最小可见骨架,已串通设计令牌 + ui-glass:

- ① 顶部公告跑马灯(`MarqueeBar`,critical 红底常驻)
- ② 消息流(`Bubble` + `Avatar`,AI 带 thinking 呼吸光)
- ③ 快捷按钮区(横滑胶囊,PC 滚轮可滑)
- ④ 输入区(胶囊多行 + 附件占位 + 发送)

数据全为 `src/mocks/data.ts`,后续由 WS / REST 替换:
- T-110 WS reconnect wrapper
- T-107 公告 / 快捷按钮 推送
- M2 AI 流式答复
- M2.5 直播间快照 + 播放诊断卡

## 视觉

- 字体:`-apple-system`(SF Pro)→ PingFang SC
- 背景:双侧紫色径向渐变 + 浅蓝磨砂底,容器使用 Glassmorphism
- 暗色:跟随系统(后续在 Settings 内可强制覆盖)
