/**
 * 鉴权与会话：
 * - 密码：PBKDF2-SHA256 加盐（迭代次数按用户存储，默认取 workerd 上限 10 万）。
 * - 会话：D1 为准、KV 缓存加速；Cookie 生命周期 400 天并在活跃时滚动续期，长期不失效。
 */

import {
  buildClearSessionCookie,
  buildSessionCookie,
  HttpError,
  isSecureRequest,
  readCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from "./http";
import {
  clampIterations,
  constantTimeEqual,
  fromBase64Url,
  pbkdf2,
  randomToken,
  sha256Hex,
  toBase64Url,
} from "./crypto";
import * as store from "./store";

const DEFAULT_ITERATIONS = 100_000;
const SESSION_TTL_MS = SESSION_MAX_AGE_SEC * 1000;
/** 会话每次活跃后最多每天滚动续期一次，避免高频写 D1。 */
const SESSION_EXTEND_AFTER_MS = 24 * 60 * 60 * 1000;
const SESSION_CACHE_TTL_SEC = 30 * 24 * 60 * 60;
const USERNAME_PATTERN = /^[\p{L}\p{N}_.@-]{2,32}$/u;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
}

export interface PasswordHash {
  algo: string;
  salt: string;
  hash: string;
  iterations: number;
}

export interface ResolvedSession {
  user: SessionUser;
  sessionId: string;
  /** 本次请求是否滚动续期（需要重发 Cookie 以推后浏览器端的过期时间）。 */
  rolledCookie: boolean;
}

export function validateUsername(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError(400, "invalid_username", "用户名必须是字符串");
  const username = raw.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, "invalid_username", "用户名需为 2-32 位字母、数字、下划线、点或短横线");
  }
  return username;
}

export function validatePassword(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError(400, "invalid_password", "密码必须是字符串");
  if (raw.length < PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, "invalid_password", `密码至少 ${PASSWORD_MIN_LENGTH} 位`);
  }
  if (raw.length > PASSWORD_MAX_LENGTH) {
    throw new HttpError(400, "invalid_password", `密码最多 ${PASSWORD_MAX_LENGTH} 位`);
  }
  return raw;
}

export function validateDisplayName(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string") throw new HttpError(400, "invalid_display_name", "显示名必须是字符串");
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return fallback;
  if ([...name].length > 24) throw new HttpError(400, "invalid_display_name", "显示名最多 24 个字符");
  return name;
}

export function iterationsFromEnv(env: Env): number {
  const parsed = Number.parseInt(env.PBKDF2_ITERATIONS ?? "", 10);
  return clampIterations(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ITERATIONS);
}

export async function hashPassword(password: string, iterations: number): Promise<PasswordHash> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, iterations);
  return {
    algo: "pbkdf2-sha256",
    salt: toBase64Url(salt),
    hash: toBase64Url(hash),
    iterations: clampIterations(iterations),
  };
}

export async function verifyPassword(user: store.UserRow, password: string): Promise<boolean> {
  const hash = await pbkdf2(password, fromBase64Url(user.pwd_salt), user.pwd_iterations);
  return await constantTimeEqual(toBase64Url(hash), user.pwd_hash);
}

export async function assertSignupCode(env: Env, raw: unknown): Promise<void> {
  const expected = env.SIGNUP_CODE;
  if (!expected) return;
  const provided = typeof raw === "string" ? raw : "";
  if (!(await constantTimeEqual(provided, expected))) {
    throw new HttpError(403, "invalid_signup_code", "邀请码不正确");
  }
}

/** KV 计数限流：允许则自增并返回 true，超限返回 false。 */
export async function allowRateLimited(
  env: Env,
  scope: string,
  identity: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const key = `rl:${scope}:${identity}`;
  const current = Number.parseInt((await env.SESSIONS.get(key)) ?? "0", 10);
  const count = Number.isFinite(current) ? current : 0;
  if (count >= limit) return false;
  await env.SESSIONS.put(key, String(count + 1), { expirationTtl: Math.max(60, windowSec) });
  return true;
}

export async function clearRateLimit(env: Env, scope: string, identity: string): Promise<void> {
  await env.SESSIONS.delete(`rl:${scope}:${identity}`);
}

function sessionCacheKey(userId: string, tokenHash: string): string {
  return `s:${userId}:${tokenHash}`;
}

function parseSessionCookieValue(value: string | null): { userId: string; token: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [version, userId, token] = parts;
  if (version !== "v1" || !userId || !token) return null;
  return { userId, token };
}

export function sessionCookieHeader(request: Request, cookieValue: string): string {
  return buildSessionCookie(cookieValue, { secure: isSecureRequest(request) });
}

export function clearSessionCookieHeader(request: Request): string {
  return buildClearSessionCookie({ secure: isSecureRequest(request) });
}

/** 会话被滚动续期时，用请求里原始 Cookie 值重发一次，推后浏览器端过期时间。 */
export function refreshSessionCookie(request: Request, response: Response): Response {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return response;
  const headers = new Headers(response.headers);
  headers.append("set-cookie", buildSessionCookie(value, { secure: isSecureRequest(request) }));
  return new Response(response.body, { status: response.status, headers });
}

export async function createSession(env: Env, request: Request, user: SessionUser): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const sessionId = crypto.randomUUID();
  await store.insertSession(env.DB, {
    id: sessionId,
    user_id: user.id,
    token_hash: tokenHash,
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    extended_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  await env.SESSIONS.put(
    sessionCacheKey(user.id, tokenHash),
    JSON.stringify({ u: user.username, n: user.displayName, sid: sessionId }),
    { expirationTtl: SESSION_CACHE_TTL_SEC },
  );
  return `v1.${user.id}.${token}`;
}

export async function resolveSession(env: Env, request: Request): Promise<ResolvedSession | null> {
  const parsed = parseSessionCookieValue(readCookie(request, SESSION_COOKIE));
  if (!parsed) return null;

  const tokenHash = await sha256Hex(parsed.token);
  const cacheKey = sessionCacheKey(parsed.userId, tokenHash);
  const cached = await env.SESSIONS.get<{ u: string; n: string; sid: string }>(cacheKey, "json");
  if (cached) {
    return {
      user: { id: parsed.userId, username: cached.u, displayName: cached.n },
      sessionId: cached.sid,
      rolledCookie: false,
    };
  }

  const row = await store.findSessionWithUser(env.DB, tokenHash);
  if (!row || row.user_id !== parsed.userId) return null;

  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    await store.deleteSessionById(env.DB, row.id);
    return null;
  }

  await env.SESSIONS.put(
    cacheKey,
    JSON.stringify({ u: row.username ?? "", n: row.display_name ?? "", sid: row.id }),
    { expirationTtl: SESSION_CACHE_TTL_SEC },
  );

  let rolledCookie = false;
  if (now - Date.parse(row.extended_at) > SESSION_EXTEND_AFTER_MS) {
    const iso = new Date(now).toISOString();
    await store.touchSession(env.DB, row.id, iso, new Date(now + SESSION_TTL_MS).toISOString(), iso);
    rolledCookie = true;
  }

  return {
    user: { id: row.user_id, username: row.username ?? "", displayName: row.display_name ?? "" },
    sessionId: row.id,
    rolledCookie,
  };
}

export async function requireSession(env: Env, request: Request): Promise<ResolvedSession> {
  const session = await resolveSession(env, request);
  if (!session) throw new HttpError(401, "unauthorized", "未登录或登录已失效");
  return session;
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const parsed = parseSessionCookieValue(readCookie(request, SESSION_COOKIE));
  if (!parsed) return;
  const tokenHash = await sha256Hex(parsed.token);
  await store.deleteSessionByHash(env.DB, tokenHash);
  await env.SESSIONS.delete(sessionCacheKey(parsed.userId, tokenHash));
}

/** 清理该用户除当前会话以外的所有会话（改密后调用），同时清掉 KV 缓存。 */
export async function destroyOtherSessions(env: Env, userId: string, keepSessionId: string): Promise<void> {
  await store.deleteUserSessionsExcept(env.DB, userId, keepSessionId);
  const list = await env.SESSIONS.list({ prefix: `s:${userId}:` });
  await Promise.all(list.keys.map((key) => env.SESSIONS.delete(key.name)));
}
