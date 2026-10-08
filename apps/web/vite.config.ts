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
 *
 * 构建目标与 PRODUCT.md 修订后的基线一致（MUI v9：Chrome 117 / Safari 17）：
 * 显式写出 target，避免默认值变化悄悄抬高兼容地板。
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
  /** 预览（构建产物 + _headers 生效）也代理 /api，便于在真实 CSP 下验证 */
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    target: ["chrome117", "edge121", "firefox121", "safari17"],
    cssTarget: "safari17",
    chunkSizeWarningLimit: 700,
  },
});
