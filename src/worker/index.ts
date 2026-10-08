/**
 * 途迹 TripTrace Worker 入口（Hono）。
 * 路由约定：仅 `/api/*` 进入 Worker（wrangler.jsonc 的 assets.run_worker_first），
 * 其余请求由 Workers 静态资源处理（含 React SPA 回退）。
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

app.notFound((c) =>
  applySecurityHeaders(c.json({ error: { code: "not_found", message: "请求的接口不存在" } }, 404)),
);

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
