/** 鉴权接口：当前用户、注册、登录、退出、修改密码。挂在 /api 下。 */

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  allowRateLimited,
  assertSignupCode,
  clearRateLimit,
  createSession,
  destroyOtherSessions,
  destroySession,
  hashPassword,
  iterationsFromEnv,
  resolveSession,
  sessionCookieOptions,
  validateDisplayName,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "../lib/auth";
import { refreshSessionCookie, requireSession, type AppEnv } from "../lib/context";
import { assertSameOrigin, clientIp, HttpError, readJsonBody, SESSION_COOKIE } from "../lib/http";
import * as store from "../lib/store";

const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_LIMIT_PER_IP = 30;
const LOGIN_LIMIT_PER_USER = 10;
const REGISTER_WINDOW_SEC = 60 * 60;
const REGISTER_LIMIT_PER_IP = 10;

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/me", async (c) => {
  const session = await resolveSession(c.get("db"), c.env, getCookie(c, SESSION_COOKIE) ?? null);
  if (session?.rolledCookie) {
    const current = getCookie(c, SESSION_COOKIE);
    if (current) setCookie(c, SESSION_COOKIE, current, sessionCookieOptions(c.req.raw));
  }
  return c.json({
    user: session ? session.user : null,
    signupCodeRequired: Boolean(c.env.SIGNUP_CODE),
    version: c.env.APP_VERSION ?? "dev",
  });
});

authRoutes.post("/auth/register", async (c) => {
  assertSameOrigin(c.req.raw);
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw);

  const allowed = await allowRateLimited(
    c.env,
    "register:ip",
    clientIp(c.req.raw),
    REGISTER_LIMIT_PER_IP,
    REGISTER_WINDOW_SEC,
  );
  if (!allowed) throw new HttpError(429, "rate_limited", "注册过于频繁，请稍后再试");

  await assertSignupCode(c.env, body.signupCode);

  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  const displayName = validateDisplayName(body.displayName, username);
  const db = c.get("db");

  if (await store.findUserByUsername(db, username)) {
    throw new HttpError(409, "username_taken", "该用户名已被使用");
  }

  const hash = await hashPassword(password, iterationsFromEnv(c.env));
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();

  try {
    await store.insertUser(db, {
      id: userId,
      username,
      displayName,
      pwdAlgo: hash.algo,
      pwdSalt: hash.salt,
      pwdHash: hash.hash,
      pwdIterations: hash.iterations,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new HttpError(409, "username_taken", "该用户名已被使用");
    }
    throw error;
  }

  const cookieValue = await createSession(db, c.env, c.req.raw, { id: userId, username, displayName });
  setCookie(c, SESSION_COOKIE, cookieValue, sessionCookieOptions(c.req.raw));
  return c.json({ user: { id: userId, username, displayName } }, 201);
});

authRoutes.post("/auth/login", async (c) => {
  assertSameOrigin(c.req.raw);
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw);

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) throw new HttpError(400, "invalid_input", "请输入用户名和密码");

  const allowedByIp = await allowRateLimited(
    c.env,
    "login:ip",
    clientIp(c.req.raw),
    LOGIN_LIMIT_PER_IP,
    LOGIN_WINDOW_SEC,
  );
  const allowedByUser = await allowRateLimited(
    c.env,
    "login:user",
    username,
    LOGIN_LIMIT_PER_USER,
    LOGIN_WINDOW_SEC,
  );
  if (!allowedByIp || !allowedByUser) {
    throw new HttpError(429, "rate_limited", "尝试过于频繁，请 15 分钟后再试");
  }

  const db = c.get("db");
  const user = await store.findUserByUsername(db, username);
  if (!user) {
    // 与真实校验保持相近耗时，避免通过响应时间探测用户名是否存在。
    await hashPassword(password, iterationsFromEnv(c.env));
    throw new HttpError(401, "invalid_credentials", "用户名或密码不正确");
  }
  if (!(await verifyPassword(user, password))) {
    throw new HttpError(401, "invalid_credentials", "用户名或密码不正确");
  }

  await clearRateLimit(c.env, "login:user", username);

  const cookieValue = await createSession(db, c.env, c.req.raw, {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  });
  setCookie(c, SESSION_COOKIE, cookieValue, sessionCookieOptions(c.req.raw));
  return c.json({ user: { id: user.id, username: user.username, displayName: user.displayName } });
});

authRoutes.post("/auth/logout", async (c) => {
  assertSameOrigin(c.req.raw);
  await destroySession(c.get("db"), c.env, getCookie(c, SESSION_COOKIE) ?? null);
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: new URL(c.req.url).protocol === "https:" });
  return c.json({ ok: true });
});

authRoutes.post("/auth/password", requireSession, refreshSessionCookie, async (c) => {
  assertSameOrigin(c.req.raw);
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw);

  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!current) throw new HttpError(400, "invalid_password", "请输入当前密码");
  const next = validatePassword(body.newPassword);

  const db = c.get("db");
  const user = c.get("user");
  const row = await store.findUserById(db, user.id);
  if (!row) throw new HttpError(401, "unauthorized", "账号不存在");
  if (!(await verifyPassword(row, current))) {
    throw new HttpError(403, "wrong_password", "当前密码不正确");
  }

  const hash = await hashPassword(next, iterationsFromEnv(c.env));
  await store.updateUserPassword(db, row.id, {
    algo: hash.algo,
    salt: hash.salt,
    hash: hash.hash,
    iterations: hash.iterations,
    updatedAt: new Date().toISOString(),
  });
  await destroyOtherSessions(db, c.env, row.id, c.get("sessionId"));

  return c.json({ ok: true });
});
