/**
 * 途迹 TripTrace Worker 入口。
 * 路由约定：/api/* 由 Worker 处理（wrangler.jsonc 的 assets.run_worker_first），
 * 其余请求由 Workers 静态资源优先处理（含 SPA 回退）。
 */

import { errorResponse, HttpError, withSecurityHeaders } from "./lib/http";
import { Router } from "./lib/router";
import { registerAuthRoutes } from "./routes/auth";
import { registerTripRoutes } from "./routes/trips";

const router = new Router();
registerAuthRoutes(router);
registerTripRoutes(router);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      const match = router.match(request.method, url.pathname);
      if (!match) throw new HttpError(404, "not_found", "接口不存在");
      if ("methodMismatch" in match) throw new HttpError(405, "method_not_allowed", "请求方法不被支持");

      const response = await match.handler({ request, env, ctx, params: match.params });
      return withSecurityHeaders(response);
    } catch (error) {
      if (error instanceof HttpError) {
        return withSecurityHeaders(errorResponse(error));
      }
      console.error(
        JSON.stringify({
          message: "unhandled_error",
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        }),
      );
      return withSecurityHeaders(errorResponse(new HttpError(500, "internal_error", "服务器内部错误")));
    }
  },
} satisfies ExportedHandler<Env>;
