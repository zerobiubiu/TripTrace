import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootPkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

/**
 * 前端是纯静态 SPA：构建产物 dist/ 直接交给 Cloudflare Pages 部署。
 * 后端是独立的 Worker（apps/api），生产环境通过同一个域名的 /api/* 路径访问，
 * 本地开发用下面的 proxy 把 /api 转发到 wrangler dev 的 8787 端口（保持同源语义）。
 */
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 400,
  },
});