import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/v1/upload": {
        target: process.env.VITE_UPLOAD_URL ?? "http://localhost:8088",
        changeOrigin: true,
      },
      "/v1/csat": {
        target: process.env.VITE_NOTIFY_URL ?? "http://localhost:8082",
        changeOrigin: true,
      },
      "/v1/quick-replies": {
        target: process.env.VITE_NOTIFY_URL ?? "http://localhost:8082",
        changeOrigin: true,
      },
      "/v1/live": {
        target: process.env.VITE_LIVECTX_URL ?? "http://localhost:8086",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2020",
    sourcemap: true,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 200,
  },
});
