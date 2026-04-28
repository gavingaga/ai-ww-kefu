import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      // 同时覆盖 /v1/agent/* 与 /v1/agent/events(SSE)— text/event-stream 透传即可
      "/v1/agent": {
        target: process.env.VITE_AGENT_BFF_URL ?? "http://localhost:8084",
        changeOrigin: true,
      },
      "/v1/supervisor": {
        target: process.env.VITE_AGENT_BFF_URL ?? "http://localhost:8084",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2020",
    sourcemap: true,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 250,
  },
});
