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
      "/v1/agent": {
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
