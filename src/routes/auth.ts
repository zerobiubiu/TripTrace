/** 鉴权相关接口：注册、登录、退出、当前用户、修改密码。 */

import {
  allowRateLimited,
  assertSignupCode,
  clearRateLimit,
  clearSessionCookieHeader,
  createSession,
  destroyOtherSessions,
  destroySession,
  hashPassword,
  iterationsFromEnv,
  refreshSessionCookie,
  requireSession,
  resolveSession,
  sessionCookieHeader,
  validateDisplayName,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "../lib/auth";
import {
  assertSameOrigin,
  clientIp,
  HttpError,
  jsonResponse,
  readJsonBody,
} from "../lib/http";
import type { RouteContext, Router } from "../lib/router";
import * as store from "../lib/store";

const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_LIMIT_PER_IP = 30;
const LOGIN_LIMIT_PER_USER = 10;
const REGISTER_WINDOW_SEC = 60 * 60;
const REGISTER_LIMIT_PER_IP = 10;

interface UserPayload {
  id: string;
  username: string;
  displayName: string;
}

function serializeUser(user: UserPayload): UserPayload {
  return { id: user.id, username: user.username, displayName: user.displayName };
}

async function handleMe({ request, env }: RouteContext): Promise<Response> {
  const session = await resolveSession(env, request);
  const response = jsonResponse({
    user: session ? serializeUser(session.user) : null,
    signupCodeRequired: Boolean(env.SIGNUP_CODE),
    version: env.APP_VERSION ?? "dev",
  });
  return session?.rolledCookie ? refreshSessionCookie(request, response) : response;
}

async function handleRegister({ request, env }: RouteContext): Promise<Response> {
  assertSameOrigin(request);
  const body = await readJsonBody<Record<string, unknown>>(request);

  const allowed = await allowRateLimited(
    env,
    "register:ip",
    clientIp(request),
    REGISTER_LIMIT_PER_IP,
    REGISTER_WINDOW_SEC,
  );
  if (!allowed) throw new HttpError(429, "rate_limited", "注册过于频繁，请稍后再试");

  await assertSignupCode(env, body.signupCode);

  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  const displayName = validateDisplayName(body.displayName, username);

  if (await store.findUserByUsername(env.DB, username)) {
    throw new HttpError(409, "username_taken", "该用户名已被使用");
  }

  const hash = await hashPassword(password, iterationsFromEnv(env));
  const now = new Date().toISOString();
  const user: store.UserRow = {
    id: crypto.randomUUID(),
    username,
    display_name: displayName,
    pwd_algo: hash.algo,
    pwd_salt: hash.salt,
    pwd_hash: hash.hash,
    pwd_iterations: hash.iterations,
    created_at: now,
    updated_at: now,
  };

  try {
    await store.insertUser(env.DB, user);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new HttpError(409, "username_taken", "该用户名已被使用");
    }
    throw error;
  }

  const cookieValue = await createSession(env, request, {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
  });

  return jsonResponse(
    { user: serializeUser({ id: user.id, username: user.username, displayName: user.display_name }) },
    { status: 201, headers: { "set-cookie": sessionCookieHeader(request, cookieValue) } },
  );
}

async function handleLogin({ request, env }: RouteContext): Promise<Response> {
  assertSameOrigin(request);
  const body = await readJsonBody<Record<string, unknown>>(request);

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) throw new HttpError(400, "invalid_input", "请输入用户名和密码");

  const allowedByIp = await allowRateLimited(
    env,
    "login:ip",
    clientIp(request),
    LOGIN_LIMIT_PER_IP,
    LOGIN_WINDOW_SEC,
  );
  const allowedByUser = await allowRateLimited(
    env,
    "login:user",
    username,
    LOGIN_LIMIT_PER_USER,
    LOGIN_WINDOW_SEC,
  );
  if (!allowedByIp || !allowedByUser) {
    throw new HttpError(429, "rate_limited", "尝试过于频繁，请 15 分钟后再试");
  }

  const user = await store.findUserByUsername(env.DB, username);
  if (!user) {
    // 与真实校验保持相近耗时，避免通过响应时间探测用户名是否存在。
    await hashPassword(password, iterationsFromEnv(env));
    throw new HttpError(401, "invalid_credentials", "用户名或密码不正确");
  }
  if (!(await verifyPassword(user, password))) {
    throw new HttpError(401, "invalid_credentials", "用户名或密码不正确");
  }

  await clearRateLimit(env, "login:user", username);

  const cookieValue = await createSession(env, request, {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
  });

  return jsonResponse(
    { user: serializeUser({ id: user.id, username: user.username, displayName: user.display_name }) },
    { headers: { "set-cookie": sessionCookieHeader(request, cookieValue) } },
  );
}

async function handleLogout({ request, env }: RouteContext): Promise<Response> {
  assertSameOrigin(request);
  await destroySession(env, request);
  return jsonResponse({ ok: true }, { headers: { "set-cookie": clearSessionCookieHeader(request) } });
}

async function handleChangePassword({ request, env }: RouteContext): Promise<Response> {
  assertSameOrigin(request);
  const session = await requireSession(env, request);
  const body = await readJsonBody<Record<string, unknown>>(request);

  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!current) throw new HttpError(400, "invalid_password", "请输入当前密码");
  const next = validatePassword(body.newPassword);

  const user = await store.findUserById(env.DB, session.user.id);
  if (!user) throw new HttpError(401, "unauthorized", "账号不存在");
  if (!(await verifyPassword(user, current))) {
    throw new HttpError(403, "wrong_password", "当前密码不正确");
  }

  const hash = await hashPassword(next, iterationsFromEnv(env));
  await store.updateUserPassword(env.DB, user.id, {
    algo: hash.algo,
    salt: hash.salt,
    hash: hash.hash,
    iterations: hash.iterations,
    updatedAt: new Date().toISOString(),
  });
  await destroyOtherSessions(env, user.id, session.sessionId);

  return jsonResponse({ ok: true });
}

export function registerAuthRoutes(router: Router): void {
  router.add("GET", "/api/me", handleMe);
  router.add("POST", "/api/auth/register", handleRegister);
  router.add("POST", "/api/auth/login", handleLogin);
  router.add("POST", "/api/auth/logout", handleLogout);
  router.add("POST", "/api/auth/password", handleChangePassword);
}
