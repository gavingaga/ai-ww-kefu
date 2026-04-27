/**
 * ai-kefu 设计令牌
 *
 * 视觉基调遵循 Apple HIG + Glassmorphism(详见 PRD §02 §2.2)。
 * - 极简几何、纯色与玻璃材质并存
 * - 颜色用 System Blue(#0A84FF)与紫色渐变(AI 状态)
 * - 圆角:卡片 16 / 气泡 18 / 按钮 12 / 输入框 22(胶囊)
 * - 字体:-apple-system 优先,字号 13/15/17/22
 *
 * 所有令牌都同步导出为 CSS 变量(见 ./tokens.css),前端可直接引用。
 */

export const color = {
  primary: "#0A84FF",
  accentFrom: "#5E5CE6",
  accentTo: "#BF5AF2",
  text: {
    primary: "#1C1C1E",
    secondary: "#3A3A3C",
    tertiary: "#8E8E93",
    inverse: "#FFFFFF",
  },
  textDark: {
    primary: "#EBEBF5",
    secondary: "#C7C7CC",
    tertiary: "#8E8E93",
    inverse: "#000000",
  },
  surface: {
    light: "rgba(255, 255, 255, 0.72)",
    lightAlt: "rgba(255, 255, 255, 0.55)",
    dark: "rgba(28, 28, 30, 0.72)",
    darkAlt: "rgba(28, 28, 30, 0.55)",
  },
  border: {
    light: "rgba(255, 255, 255, 0.30)",
    dark: "rgba(255, 255, 255, 0.10)",
  },
  semantic: {
    info: "#0A84FF",
    success: "#34C759",
    warning: "#FF9F0A",
    danger: "#FF3B30",
    critical: "#FF453A",
  },
  bubble: {
    user: "#0A84FF",
    agent: "rgba(118, 118, 128, 0.16)",
    aiFrom: "#5E5CE6",
    aiTo: "#BF5AF2",
    system: "rgba(118, 118, 128, 0.12)",
  },
} as const;

export const radius = {
  capsule: "9999px",
  card: "16px",
  bubble: "18px",
  button: "12px",
  input: "22px",
  sm: "8px",
  xs: "4px",
} as const;

export const spacing = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
} as const;

export const fontSize = {
  caption: ["13px", { lineHeight: "18px" }],
  body: ["15px", { lineHeight: "22px" }],
  bodyEmphasis: ["17px", { lineHeight: "24px" }],
  title: ["22px", { lineHeight: "28px" }],
} as const;

export const fontFamily = {
  sans: [
    "-apple-system",
    "BlinkMacSystemFont",
    '"SF Pro Text"',
    '"PingFang SC"',
    '"Helvetica Neue"',
    "system-ui",
    "sans-serif",
  ],
  mono: ['"SF Mono"', "Menlo", "Consolas", "monospace"],
} as const;

export const shadow = {
  glass: "0 8px 32px rgba(31, 38, 135, 0.12)",
  glassHover: "0 12px 36px rgba(31, 38, 135, 0.18)",
  card: "0 4px 16px rgba(0, 0, 0, 0.06)",
  popover: "0 12px 28px rgba(0, 0, 0, 0.16)",
} as const;

export const blur = {
  glassWeak: "12px",
  glass: "24px",
  glassStrong: "40px",
} as const;

export const motion = {
  duration: {
    fast: "180ms",
    base: "280ms",
    slow: "400ms",
  },
  easing: {
    standard: "cubic-bezier(0.32, 0.72, 0, 1)",
    enter: "cubic-bezier(0.0, 0.0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0.0, 1, 1)",
    breathing: "cubic-bezier(0.4, 0.0, 0.6, 1.0)",
  },
} as const;

export const z = {
  base: 0,
  bubble: 10,
  marquee: 20,
  drawer: 100,
  modal: 200,
  toast: 300,
  haptic: 999,
} as const;

export const tokens = {
  color,
  radius,
  spacing,
  fontSize,
  fontFamily,
  shadow,
  blur,
  motion,
  z,
} as const;

export type DesignTokens = typeof tokens;
export default tokens;
