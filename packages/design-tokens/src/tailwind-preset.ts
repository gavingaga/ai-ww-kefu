/**
 * Tailwind preset — 把设计令牌注入 Tailwind 主题。
 * 在应用 tailwind.config.{ts,js} 里:
 *   import preset from "@ai-kefu/design-tokens/tailwind-preset";
 *   export default { presets: [preset], content: [...] };
 */
import { color, radius, spacing, fontSize, fontFamily, shadow, blur, motion, z } from "./tokens.js";

const preset = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: color.primary,
        "accent-from": color.accentFrom,
        "accent-to": color.accentTo,
        text: color.text,
        "text-dark": color.textDark,
        surface: color.surface,
        border: color.border,
        semantic: color.semantic,
        bubble: color.bubble,
      },
      borderRadius: radius,
      spacing,
      fontSize,
      fontFamily,
      boxShadow: shadow,
      backdropBlur: blur,
      transitionTimingFunction: motion.easing,
      transitionDuration: motion.duration,
      zIndex: z,
    },
  },
};

export default preset;
