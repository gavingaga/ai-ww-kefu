import preset from "@ai-kefu/design-tokens/tailwind-preset";
import type { Config } from "tailwindcss";

export default {
  presets: [preset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui-glass/src/**/*.{ts,tsx}",
  ],
  corePlugins: {
    preflight: true,
  },
} satisfies Config;
