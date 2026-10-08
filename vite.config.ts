import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Cloudflare Vite 插件负责：以 Workers 运行时跑 Worker 代码（本地 D1/KV 绑定）、
 * 构建前端产物与 Worker 打包，并生成供 `wrangler deploy` 使用的输出配置。
 */
export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    // 移动端真机调试时可改为 "0.0.0.0"
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    // 移动端优先：控制首屏脚本体积，超过阈值告警
    chunkSizeWarningLimit: 400,
  },
});
