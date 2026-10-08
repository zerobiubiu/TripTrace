/**
 * Hono 应用上下文：绑定、请求变量与中间件。
 * 顺序约定：`securityHeaders` → `attachDb` → `requireSession`（受保护路由）。
 */

import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { resolveSession, sessionCookieOptions, type SessionUser } from "./auth";
import { createDb, type Db } from "./db";
import { applySecurityHeaders, HttpError, SESSION_COOKIE } from "./http";

export interface AppEnv {
  Bindings: CloudflareBindings;
  Variables: {
    db: Db;
    user: SessionUser;
    sessionId: string;
    rolledCookie: boolean;
  };
}

/** 给所有响应补安全头（含错误响应，需在 onError 里同样处理）。 */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.res = applySecurityHeaders(c.res);
});

/** 每个请求创建一个 Drizzle 客户端（D1 绑定是无状态的，创建成本极低）。 */
export const attachDb = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

/** 校验会话；未登录直接抛 401。 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await resolveSession(c.get("db"), c.env, getCookie(c, SESSION_COOKIE) ?? null);
  if (!session) throw new HttpError(401, "unauthorized", "未登录或登录已失效");
  c.set("user", session.user);
  c.set("sessionId", session.sessionId);
  c.set("rolledCookie", session.rolledCookie);
  await next();
});

/** 会话被滚动续期时重发 Cookie，推后浏览器端过期时间（每天最多一次）。 */
export const refreshSessionCookie = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("rolledCookie")) {
    const current = getCookie(c, SESSION_COOKIE);
    if (current) setCookie(c, SESSION_COOKIE, current, sessionCookieOptions(c.req.raw));
  }
  await next();
});

/** 受保护路由统一挂载的中间件（放在具体路由上，避免影响兄弟路由的路径空间）。 */
export const authedHandlers = [requireSession, refreshSessionCookie] as const;
