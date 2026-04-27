# C 端 · Web H5 产品需求

## 1. 适配范围

- **PC Web**: Chrome / Safari / Edge 最近 2 个版本,最小宽度 360px,推荐 1280×800。
- **Mobile H5**: iOS Safari 14+ / Android Chrome 90+。
- **WebView**: iOS WKWebView / Android System WebView(直播 App 内),需兼容宿主 App 的 JSBridge 主题/用户态/`live_context` 注入。

> 单一 React 应用,通过响应式布局 + 容器自适应,不再单独维护 PC 站。WebView 通过 UA / URL 参数 `?env=webview` 进入沉浸模式(去顶部 Bar、改用宿主导航)。

### 1.1 接入形态(直播/点播专属)

| 形态 | 场景 | 行为要点 |
|------|------|---------|
| **悬浮按钮 (Floating Bubble)** | 直播间内 / 点播详情页内 | 默认右下角胶囊,8s 无交互自动半透明;支持拖拽吸边;点击展开为抽屉式半屏客服(50% 高度),不阻挡播放器 |
| **半屏抽屉** | 移动端竖屏直播间内 | 上半屏继续播放视频(画中画/小窗),下半屏为客服;支持上滑全屏、下滑收起 |
| **全屏会话** | 设置页/帮助中心入口、PC | 完整客服页面 |
| **横屏全屏播放期间** | 用户在全屏看直播/比赛 | 客服以底部胶囊 toast 形式呼出半透明面板,不退出全屏;键盘弹起时不顶起视频 |
| **PIP / 小窗共存** | iOS Safari / Android PIP | 客服窗口避让 PIP 区域,Z 序低于 PIP |

宿主 App 可通过 URL 参数指定形态: `?mode=bubble|drawer|fullscreen`。

## 2. 视觉与交互规范 (Apple HIG · Glassmorphism)

### 2.1 设计基调

- **极简几何**: 仅使用圆角矩形、圆形、胶囊;禁用拟物纹理和厚阴影。
- **Glassmorphism**:
  - 背景: `backdrop-filter: blur(24px) saturate(180%);`
  - 透明度: 0.55 ~ 0.75
  - 1px 边框: `rgba(255,255,255,0.3)`
  - 投影: `0 8px 32px rgba(31, 38, 135, 0.12)`
- **配色**(浅色主题,自动跟随系统暗色):
  - Primary: `#0A84FF` (iOS System Blue)
  - Accent (AI 状态): 渐变 `#5E5CE6 → #BF5AF2`
  - Surface: 半透明白 / 系统材质 (UltraThinMaterial 等价)
  - 文本: `#1C1C1E` / `#EBEBF5`(暗色)
- **字体**: -apple-system, SF Pro Text, "PingFang SC", system-ui;字号 13/15/17/22。
- **圆角**: 卡片 16px、气泡 18px、按钮 12px、输入框 22px(胶囊)。

### 2.2 微动效

| 场景 | 动效 |
|------|------|
| AI 思考 | "呼吸灯":三个圆点从透明度 0.3↔1.0 节奏循环 1.4s,同时整体气泡边缘有 1px 流光 |
| 消息进入 | 自下而上 12px translateY + opacity 0→1, 280ms cubic-bezier(0.32,0.72,0,1) |
| 按下反馈 | scale 0.97 + 触感反馈 (Haptics, WebView 经 JSBridge) |
| 跑马灯 | 等速线性滚动,鼠标悬停暂停;移动端可手势横向拖动 |
| 转人工 | 顶部状态条颜色由蓝渐变到绿色,带 600ms 平滑过渡 |

### 2.3 无障碍

- 满足 WCAG 2.1 AA 对比度。
- 所有可点击元素 ≥ 44×44pt 触控区域。
- 支持 VoiceOver / TalkBack 朗读消息。
- 支持系统级"减少动态效果"开关。

## 3. 页面结构

```
┌──────────────────────────────────┐
│  ① 公告跑马灯 (44pt, 玻璃材质)      │
├──────────────────────────────────┤
│                                  │
│                                  │
│       ② 消息流区域                 │
│   (虚拟列表, 倒序加载历史)          │
│                                  │
│                                  │
├──────────────────────────────────┤
│  ③ 快捷按钮区 (横滑胶囊按钮组)      │
├──────────────────────────────────┤
│  ④ 输入区 (附件 / 输入框 / 发送)    │
└──────────────────────────────────┘
```

### 3.1 ① 公告跑马灯

- 数据源: 管理后台「公告管理」配置,支持多条循环。
- 单条结构: `{ id, level, content, link?, startAt, endAt }`,level: info/warning/critical。
- 展示规则:
  - 多条时按权重轮播,critical 级常驻并加红色玻璃底。
  - 文本可点击跳链(WebView 内由 JSBridge 处理);非 link 区域点击展开全文弹层。
  - 用户关闭(右侧 ×)后该条 24h 内不再展示(localStorage 记 id)。
- 性能: 使用 `requestAnimationFrame` 而非 `marquee`,后台 tab 时暂停。

### 3.2 ② 消息流

- **消息类型**:
  - 文本(支持链接识别、emoji、@、Markdown 子集: 加粗/列表/代码块)
  - 图片(缩略图 + 点击大图,支持手势缩放;上传中显示进度环)
  - 文件(图标 + 文件名 + 大小 + 下载;最大 50MB,白名单后缀)
  - 系统消息(转人工提示、坐席进入/离开、会话结束等)
  - **直播间快照卡片**: 显示当前节目封面/标题/主播/清晰度,首条由系统下发,标识"是这个出现问题吗?",一键确认/切换房间
  - **播放诊断卡片**: 网络下行、CDN 节点、卡顿次数/时长、首帧耗时、当前清晰度、设备 + 一键"刷新诊断 / 上报"按钮(详见 §3.7)
  - **会员订阅卡片**: 当前会员等级、到期时间、是否连续包月,按钮「续费」「取消」「转人工」
  - **节目卡片**: 用于 AI 推荐回看 / 同主播其它直播
  - **表单卡片**: 退款申请、举报、未成年监护人信息收集
  - **常见问题卡片**(欢迎语之后下发,详见 §3.5)
- **气泡样式**:
  - AI: 浅紫渐变玻璃 + 左上角 AI 头像,头像带"呼吸灯"边框
  - 坐席: 中性灰玻璃 + 坐席头像/昵称/工号
  - 用户: System Blue 实色,右对齐
- **状态指示**: 发送中 / 已送达 / 已读(底部 12pt 灰字)
- **历史消息**: 虚拟列表,初始加载 30 条,上拉加载历史(分页 30/页)。
- **未读提示**: 视口外新消息时,右下角"↓ N 条新消息"胶囊。

### 3.3 ③ 快捷按钮区

- **数据源**: 后台「快捷按钮」配置,支持按场景分组(欢迎/售前/售后)和按用户标签下发。
- **结构**: `{ id, label, payload, scene, sortOrder, icon? }`,payload 即点击后实际发送的文案(支持模板变量 `{{user.name}}`)。
- **交互**:
  - 横滑可见 ≥ 4 个,超出可滑动;PC 显示鼠标 hover 滚动。
  - 点击 → 直接以用户身份发送 payload → 滚动到底部。
  - 长按(移动端)/ 右键(PC)显示完整文案预览。
- **动态刷新**: 进入会话/切换技能组时拉一次;后台改动通过推送实时更新。

### 3.5 常见问题模块 (FAQ Tree)

紧跟欢迎语之后下发的一张「常见问题」卡片,提供多级目录式快速解答,目标覆盖头部 60% 高频问题、避免用户敲字。

- **位置**: 会话首条系统欢迎语之后,以 AI 身份下发的卡片消息;每次新会话默认展示一次。后续可通过快捷按钮「常见问题」或 AI 兜底文案中的「查看常见问题」再次唤起。
- **数据结构**(后台「常见问题」模块维护,支持任意层级,推荐 ≤ 3 级):
  ```jsonc
  {
    "id": "faq_root_xxx",
    "tenant_id": 1,
    "scene": "welcome",          // welcome / aftersale / presale ...
    "target_segment": { ... },    // 用户标签灰度
    "version": 12,
    "nodes": [
      {
        "id": "n1",
        "title": "订单与物流",
        "icon": "📦",
        "children": [
          {
            "id": "n1-1",
            "title": "如何查询订单状态?",
            "children": [...]      // 可继续下钻
          },
          {
            "id": "n1-2",
            "title": "我的快递停滞怎么办?",
            "answer": {            // 叶子节点必有 answer
              "content_md": "请提供订单号,我帮你加急...",
              "attachments": [{ "type": "image|file|link", "url": "..." }],
              "follow_ups": [       // 答案下方的延伸问题(同级 FAQ)
                { "id": "n1-3", "title": "怎么修改收货地址?" }
              ],
              "actions": [          // 答案下方的动作按钮
                { "type": "send_text", "label": "仍未解决", "payload": "我的问题没有解决" },
                { "type": "handoff", "label": "转人工" }
              ]
            }
          }
        ]
      },
      { "id": "n2", "title": "退换货", "children": [...] }
    ]
  }
  ```
- **交互**:
  - **首层**: 卡片内以 2 列网格展示分类(图标 + 标题),每行最多 6 个,超出折叠为「更多」。
  - **下钻**: 点击非叶子节点 → 卡片内原地切换为下一级列表,顶部出现「‹ 返回」与面包屑(如「订单与物流 › 物流问题」),保留滑入动效(280ms)。
  - **叶子点击**: 以用户身份"发送"该问题文本(右侧蓝色气泡),随后 AI 直接以预设答案回复(走 FAQ 通道,不消耗 LLM Token);若该叶子未配置 `answer`,则降级走 RAG / LLM。
  - **延伸问题**: 答案气泡下方以小胶囊形式展示 `follow_ups`,点击同上。
  - **动作按钮**: `send_text`(发送指定文案)、`handoff`(主动转人工)、`open_link`(打开链接,WebView 经 JSBridge)、`open_form`(打开表单卡片)。
  - **再次唤起**: 用户可输入 `菜单` / `常见问题` 或点击快捷按钮「常见问题」重新展开,默认从根节点开始。
- **样式**:
  - 玻璃卡片,圆角 16px,深浅自适应。
  - 节点项:48pt 高、左 emoji/图标、右 chevron;叶子节点 chevron 替换为 `›`。
  - 命中后短暂高亮(200ms System Blue 8%)。
- **性能与缓存**:
  - 进入会话时随欢迎语一起下发整棵树(预计 ≤ 50KB,gzip 后 ≤ 10KB);超过则只下发首层 + 懒加载子级(`GET /faq/tree?node_id=`)。
  - 客户端按 `version` 缓存,后台变更通过 `event.faq_update` 推送失效。
- **埋点**: 节点曝光、点击、命中叶子、是否触发后续 LLM 兜底、是否最终转人工 — 全部回流到「FAQ 数据面」(管理后台报表)。
- **可访问性**: 所有节点均可键盘 Tab + Enter 操作;VoiceOver 朗读"分类:订单与物流,共 6 个问题"。

### 3.6 直播/点播 业务上下文注入

进入会话时由 H5 自动收集并随 `visitors/auth` / WS `event.context` 上报,后续每条用户消息都附带最近一次快照。

```jsonc
{
  "live_context": {
    "scene": "live_room | vod_detail | home | settings",
    "room_id": 8001,
    "anchor_id": 1234,
    "vod_id": null,
    "program_title": "周末游戏直播",
    "play": {
      "state": "playing | buffering | paused | error",
      "quality": "auto | 360p | 720p | 1080p | 4k",
      "bitrate_kbps": 3200,
      "fps": 30,
      "first_frame_ms": 480,
      "buffer_events_60s": 4,
      "buffer_total_ms_60s": 1200,
      "last_error_code": "NET-1003",
      "cdn_node": "sh-edge-3",
      "stream_url_hash": "ab12...",
      "drm": false
    },
    "device": { "platform": "iOS | Android | PC", "os": "iOS 18.2", "app_ver": "7.3.1", "model": "iPhone 15" },
    "network": { "type": "wifi | 4g | 5g", "rtt_ms": 32, "downlink_mbps": 12.5 },
    "user": { "uid": 100, "level": "VIP3", "is_anchor": false, "is_minor_guard": false },
    "entry": "bubble | drawer | menu | report_button",
    "report": { "type": "porn|abuse|copyright|other", "evidence_clip_url": "...", "ts_in_stream": 12345 }
  }
}
```

- 由宿主 App / 播放器 SDK 通过 JSBridge `kefu.setLiveContext(json)` 推送;不可用时 H5 自取(URL 参数 + 浏览器 `navigator.connection`)。
- AI 中枢据此注入 Prompt,首条欢迎语自动改写为"看到您正在观看《xxx》,请问需要为您解决哪类问题?"
- 转人工时进入 Handoff Packet,坐席侧栏直接展示。
- 隐私: 不上传具体 stream_url,只上传 hash;不上传 IP,由后端反查。

### 3.7 播放诊断与一键上报

- 用户在播放问题场景下,客服面板顶部出现"我在卡 / 打不开"快捷入口,点击即:
  1. 立即拉一次最新 `live_context.play` + 收集最近 60s 播放器事件日志(由 SDK 提供 ring buffer)
  2. 以"播放诊断卡片"形式作为用户首条消息发送(自动追加文本"我看视频卡顿,这是诊断信息")
  3. AI 调用 `get_play_diagnostics(uid, room_id)` 获取服务端 QoE 数据,合并展示
- 卡片可折叠展示原始日志(给坐席用);用户侧默认只显示精简结论(如"WiFi 较差,建议切到 480p")。
- 提供「刷新诊断」「切清晰度」「重新进入直播间」「转人工」按钮。

### 3.8 ④ 输入区

- **组件**:
  - 左:附件按钮(📎),展开「图片 / 文件 / 拍照(WebView)」。
  - 中:多行胶囊输入框,自动 1~5 行扩展,IME 友好。
  - 右:发送按钮(空文本时灰)。
  - 顶部:正在输入提示(对方/AI 正在输入...)。
- **快捷键**:
  - PC: `Enter` 发送,`Shift+Enter` 换行。
  - Mobile: 系统键盘"发送"键。
- **文件上传**:
  - 直传 OSS(前端取临时签名),上传完成后发送消息。
  - 图片自动压缩(长边 2048,质量 0.8);超 10MB 提示。

## 4. 关键状态

| 状态 | UI 表现 |
|------|---------|
| 连接中 | 顶部细线渐变流光 + "正在连接..." |
| AI 思考中 | AI 头像呼吸灯 + 占位气泡(三点动画) |
| 排队中 | 系统卡片"前面还有 X 位,预计 Y 秒" + 取消排队按钮 |
| 人工接入 | 系统提示 + 状态条颜色切换 + Haptic |
| 会话结束 | 满意度评价卡片(1~5 星 + 标签 + 备注)+ 重启会话按钮 |
| 网络断开 | 顶部红色玻璃条"网络异常,正在重连...",自动重试 |

## 5. 核心非功能

- **首屏 LCP** ≤ 1.5s (4G):路由懒加载、SSR/SSG 静态壳、关键 CSS 内联。
- **包体**: 主 chunk gzip ≤ 180KB。
- **长连接**: WebSocket(优先) + SSE 降级 + 长轮询兜底。
- **离线/弱网**: IndexedDB 缓存最近 100 条消息;发送队列重试。
- **隐私**: 本地不持久化敏感字段(token 仅 sessionStorage)。
- **埋点**: 关键事件(进入、首条消息、转人工、上传、关闭)上报。

## 6. WebView 协议 (JSBridge 约定)

| 方法 | 方向 | 说明 |
|------|------|------|
| `kefu.ready()` | JS→Native | H5 加载完成 |
| `kefu.setUserToken(token)` | Native→JS | 注入用户态,免登录 |
| `kefu.setLiveContext(ctx)` | Native→JS | 推送/更新直播上下文(进直播间、切清晰度、卡顿事件等触发) |
| `kefu.requestPlayDiagnostics()` | JS→Native | 请求宿主播放器最近 60s 日志/QoE,异步返回 |
| `kefu.switchQuality(level)` | JS→Native | AI/坐席建议切换清晰度,经用户同意后触发 |
| `kefu.reenterRoom(roomId)` | JS→Native | 重进直播间(故障恢复) |
| `kefu.openLink(url)` | JS→Native | 链接由宿主处理 |
| `kefu.haptic(type)` | JS→Native | 触感反馈 |
| `kefu.minimize()` | JS→Native | 最小化为悬浮气泡(不关闭会话) |
| `kefu.close()` | JS→Native | 关闭客服窗 |
| `kefu.onThemeChange(theme)` | Native→JS | 跟随宿主明暗主题 |
| `kefu.onOrientation(orient)` | Native→JS | 横竖屏切换通知,前端调整布局 |
| `kefu.onPipChange(active)` | Native→JS | 画中画状态变化 |

## 7. 验收要点

- 在 iPhone SE / 14 Pro / iPad / 1080p 桌面下截图均符合视觉走查。
- 1000 条历史消息滚动 60fps、无白屏。
- 弱网(Slow 3G)下首屏可用,断网恢复后消息不丢、不重复。
- 公告 / 快捷按钮 改动后 ≤ 5s 在前端生效(推送)。
