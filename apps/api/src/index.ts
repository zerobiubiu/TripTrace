/**
 * 途迹 TripTrace 后端 Worker（Hono）。
 * 只提供 `/api/*`：
 * - 生产环境通过自定义域路由 `trips.zerobiubiu.top/api/*` 接收请求（前端在同一个域名的 `/`，由 Pages 托管）；
 * - 本地开发由 Vite 的 `/api` 代理转发到 `wrangler dev`；
 * - 其它路径（例如 workers.dev 旧地址）302 跳转到前端站点。
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
  const url = new URL(c.req.url);
  const webAppUrl = c.env.WEB_APP_URL;
  if (webAppUrl && !url.pathname.startsWith("/api/")) {
    const target = new URL(`${url.pathname}${url.search}`, webAppUrl);
    return applySecurityHeaders(c.redirect(target.toString(), 302));
  }
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
