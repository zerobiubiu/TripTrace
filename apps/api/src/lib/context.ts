/**
 * Hono 应用上下文：绑定、请求变量与中间件。
 * 顺序约定：`securityHeaders` → `attachDb` → `requireSession`（受保护路由）→ `requireAdmin`（管理员路由）。
 */

import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { resolveSession, sessionCookieOptions, type SessionUser } from "./auth";
import { sha256Hex } from "./crypto";
import { createDb, type Db } from "./db";
import { applySecurityHeaders, HttpError, SESSION_COOKIE } from "./http";
import * as store from "./store";

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

/** 是否管理员：`ADMIN_USERNAMES` 逗号分隔、大小写不敏感；未配置时无人具备管理员权限。 */
export function isAdmin(env: CloudflareBindings, username: string): boolean {
  const admins = (env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(username.trim().toLowerCase());
}

/** 会话 KV 缓存键（与 lib/auth.ts 的写入格式一致）：`s:<userId>:<sha256(token)>`。 */
export function sessionCacheKey(userId: string, tokenHash: string): string {
  return `s:${userId}:${tokenHash}`;
}

/** 从会话 Cookie 值（`v1.<userId>.<token>`）取出 token；格式不符返回 null。 */
function sessionTokenFromCookie(cookieValue: string | null): string | null {
  const [version, , token] = cookieValue?.split(".") ?? [];
  return version === "v1" && token ? token : null;
}

/** 清除某用户的全部会话缓存（禁用、重置密码、删除账号后调用）；分页清理，避免超过单页 1000 键时遗漏。 */
export async function clearUserSessionCache(env: CloudflareBindings, userId: string): Promise<void> {
  const prefix = `s:${userId}:`;
  let cursor: string | undefined;
  for (;;) {
    const page = await env.SESSIONS.list({ prefix, cursor });
    await Promise.all(page.keys.map((key) => env.SESSIONS.delete(key.name)));
    if (page.list_complete) return;
    cursor = page.cursor;
  }
}

/** 校验会话；未登录、或账号已被禁用（含已被删除）时抛 401，并顺手作废这次会话。 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get("db");
  const cookieValue = getCookie(c, SESSION_COOKIE) ?? null;
  const session = await resolveSession(db, c.env, cookieValue);
  if (!session) throw new HttpError(401, "unauthorized", "未登录或登录已失效");

  // 禁用后既有会话立即失效（D1 + KV 都清），响应与未登录同形。
  const account = await store.findUserById(db, session.user.id);
  if (!account || account.disabledAt) {
    await store.deleteSessionById(db, session.sessionId);
    const token = sessionTokenFromCookie(cookieValue);
    if (token) await c.env.SESSIONS.delete(sessionCacheKey(session.user.id, await sha256Hex(token)));
    throw new HttpError(401, "unauthorized", "未登录或登录已失效");
  }

  c.set("user", session.user);
  c.set("sessionId", session.sessionId);
  c.set("rolledCookie", session.rolledCookie);
  await next();
});

/** 管理员校验：按顺序必须挂在 `requireSession` 之后（依赖 `c.get("user")`）。 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAdmin(c.env, c.get("user").username)) {
    throw new HttpError(403, "forbidden", "需要管理员权限");
  }
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
