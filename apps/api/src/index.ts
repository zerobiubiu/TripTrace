/**
 * 途迹 TripTrace Worker（Hono + 静态资源），**单部署物**：
 * - `/api`、`/api/*` 由 `run_worker_first` 交给 Hono 路由；
 * - 其余路径由 `assets` 绑定提供 `apps/web/dist`（未命中按 SPA 回退 index.html）；
 * - 安全响应头随静态资源由 `apps/web/public/_headers` 下发，接口响应由 `securityHeaders` 中间件补齐。
 * 本地开发：`bun run build:web && bun run dev:api` 即与生产同形态；`bun run dev:web`（Vite HMR）走 proxy 转发 /api。
 */

import { Hono } from "hono";
import { attachDb, securityHeaders, type AppEnv } from "./lib/context";
import { applySecurityHeaders, HttpError } from "./lib/http";
import { authRoutes } from "./routes/auth";
import { tripRoutes } from "./routes/trips";

const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("/api/*", attachDb);
app.route("/api", authRoutes);
app.route("/api", tripRoutes);

app.notFound((c) => {
  // 只有 /api 前缀会进入 Worker（其余交给静态资源），因此这里只可能是接口 404
  return applySecurityHeaders(c.json({ error: { code: "not_found", message: "请求的接口不存在" } }, 404));
});

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return applySecurityHeaders(
      c.json({ error: { code: error.code, message: error.message, details: error.details } }, error.status),
    );
  }
  console.error(
    JSON.stringify({
      message: "unhandled_error",
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      cause: error instanceof Error && error.cause ? String((error.cause as Error).message ?? error.cause) : undefined,
    }),
  );
  return applySecurityHeaders(c.json({ error: { code: "internal_error", message: "服务器内部错误" } }, 500));
});

export default app;
