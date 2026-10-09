/** 鉴权接口：当前用户、注册、登录、退出、修改密码。挂在 /api 下。 */

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type {
  AuthResponse,
  AvatarPayload,
  MeResponse,
  OkResponse,
  ProfilePatch,
  SessionListResponse,
  UserDto,
} from "@triptrace/contracts";
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
import {
  authedHandlers,
  clearUserSessionCache,
  isAdmin,
  refreshSessionCookie,
  requireSession,
  sessionCacheKey,
  type AppEnv,
} from "../lib/context";
import { applySecurityHeaders, assertSameOrigin, clientIp, HttpError, readJsonBody, SESSION_COOKIE } from "../lib/http";
import * as store from "../lib/store";

const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_LIMIT_PER_IP = 30;
const LOGIN_LIMIT_PER_USER = 10;
const REGISTER_WINDOW_SEC = 60 * 60;
const REGISTER_LIMIT_PER_IP = 10;
const DISPLAY_NAME_MAX_LENGTH = 24;

/** 个人资料的显示名：折叠空白后 trim，1..24 个字符（与注册的校验口径一致，但要求非空）。 */
function validateProfileDisplayName(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError(400, "invalid_display_name", "显示名必须是字符串");
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new HttpError(400, "invalid_display_name", "显示名不能为空");
  if ([...name].length > DISPLAY_NAME_MAX_LENGTH) {
    throw new HttpError(400, "invalid_display_name", `显示名最多 ${DISPLAY_NAME_MAX_LENGTH} 个字符`);
  }
  return name;
}

/** 统一的对外用户表示：只带头像**版本**，不带头像本体（本体走 /api/me/avatar）。 */
function toUserDto(user: {
  id: string;
  username: string;
  displayName: string;
  avatarUpdatedAt?: string | null;
}): UserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUpdatedAt: user.avatarUpdatedAt ?? null,
  };
}

/** 头像上限：客户端已压到最长边 ≤1000px，这里再按解压后的字节数兜底（1000px JPEG 通常在 150–400KB）。 */
const AVATAR_MAX_BYTES = 700 * 1024;
/** 请求体上限：700KB 的图经 base64 后约 933KB，留出 JSON 包装余量（默认 512KB 会先于体积校验拦掉）。 */
const AVATAR_MAX_BODY_BYTES = 1536 * 1024;
const AVATAR_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function decodeAvatarDataUrl(raw: unknown): { dataUrl: string; contentType: string; bytes: Uint8Array } {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new HttpError(400, "invalid_avatar", "头像数据格式不正确");
  }
  const dataUrl = raw.trim();
  const match = AVATAR_DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new HttpError(400, "invalid_avatar", "头像只支持 JPEG / PNG / WebP 的 data URL");
  const subtype = match[1] ?? "jpeg";
  const base64 = match[2] ?? "";
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new HttpError(400, "invalid_avatar", "头像数据无法解码");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new HttpError(
      400,
      "avatar_too_large",
      `头像过大（${Math.round(bytes.byteLength / 1024)}KB），请压缩到 ${AVATAR_MAX_BYTES / 1024}KB 以内`,
    );
  }
  return { dataUrl, contentType: `image/${subtype}`, bytes };
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/me", async (c) => {
  const session = await resolveSession(c.get("db"), c.env, getCookie(c, SESSION_COOKIE) ?? null);
  if (session?.rolledCookie) {
    const current = getCookie(c, SESSION_COOKIE);
    if (current) setCookie(c, SESSION_COOKIE, current, sessionCookieOptions(c.req.raw));
  }
  const payload: MeResponse = {
    user: session ? toUserDto(session.user) : null,
    signupCodeRequired: Boolean(c.env.SIGNUP_CODE),
    version: c.env.APP_VERSION ?? "dev",
    isAdmin: session ? isAdmin(c.env, session.user.username) : false,
  };
  return c.json(payload);
});

/** 修改显示名：仅本人资料，会话缓存里的旧显示名一并作废。 */
authRoutes.patch("/me", ...authedHandlers, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const body = await readJsonBody<Partial<ProfilePatch> | null>(c.req.raw);
  const displayName = validateProfileDisplayName(body?.displayName);

  const db = c.get("db");
  const user = c.get("user");
  await store.updateUserDisplayName(db, user.id, displayName, new Date().toISOString());
  // KV 会话缓存里存着旧显示名，清掉让下一次请求从 D1 回源（会话本身仍在 D1，不影响登录态）。
  await clearUserSessionCache(c.env, user.id);

  const payload: AuthResponse = { user: toUserDto({ ...user, displayName }) };
  return c.json(payload);
});

/**
 * 上传/更换头像：body 是客户端压好的 data URL（最长边 ≤1000px，解压后 ≤700KB）。
 * 头像本体不进任何 JSON：版本号变化即 URL 变化，浏览器按 /api/me/avatar?v=… 长缓存。
 */
authRoutes.put("/me/avatar", ...authedHandlers, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const body = await readJsonBody<Partial<AvatarPayload> | null>(c.req.raw, AVATAR_MAX_BODY_BYTES);
  const { dataUrl } = decodeAvatarDataUrl(body?.dataUrl);

  const db = c.get("db");
  const user = c.get("user");
  const now = new Date().toISOString();
  await store.updateUserAvatar(db, user.id, dataUrl, now);
  // 会话缓存里存着旧的头像版本，清掉让下一次请求从 D1 回源。
  await clearUserSessionCache(c.env, user.id);

  const payload: AuthResponse = { user: toUserDto({ ...user, avatarUpdatedAt: now }) };
  return c.json(payload);
});

/** 移除头像：回到显示名首字生成的默认头像。 */
authRoutes.delete("/me/avatar", ...authedHandlers, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const db = c.get("db");
  const user = c.get("user");
  await store.clearUserAvatar(db, user.id, new Date().toISOString());
  await clearUserSessionCache(c.env, user.id);

  const payload: AuthResponse = { user: toUserDto({ ...user, avatarUpdatedAt: null }) };
  return c.json(payload);
});

/** 头像本体：私有长缓存（`?v=` 变化即失效）；没有头像时 404 + no-store，客户端据此回退默认头像。 */
authRoutes.get("/me/avatar", ...authedHandlers, async (c) => {
  const raw = await store.findUserAvatar(c.get("db"), c.get("user").id);
  if (!raw) {
    return applySecurityHeaders(new Response(null, { status: 404, headers: { "cache-control": "no-store" } }));
  }
  const { bytes, contentType } = decodeAvatarDataUrl(raw);
  return applySecurityHeaders(
    new Response(bytes, {
      status: 200,
      headers: { "content-type": contentType, "cache-control": "private, max-age=31536000, immutable" },
    }),
  );
});

/** 登录设备列表：仅本人会话，最近活跃在前。 */
authRoutes.get("/me/sessions", ...authedHandlers, async (c) => {
  const rows = await store.listUserSessions(c.get("db"), c.get("user").id);
  const currentSessionId = c.get("sessionId");
  const payload: SessionListResponse = {
    sessions: rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent?.trim() || "未知设备",
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      current: row.id === currentSessionId,
    })),
  };
  return c.json(payload);
});

/** 登出指定设备：只能操作自己的会话，跨用户一律 404。 */
authRoutes.delete("/me/sessions/:id", ...authedHandlers, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const db = c.get("db");
  const userId = c.get("user").id;

  const session = await store.findSessionForUser(db, userId, c.req.param("id"));
  if (!session) throw new HttpError(404, "session_not_found", "会话不存在");

  await store.deleteSessionById(db, session.id);
  await c.env.SESSIONS.delete(sessionCacheKey(userId, session.tokenHash));

  const payload: OkResponse = { ok: true };
  return c.json(payload);
});

authRoutes.post("/auth/register", async (c) => {
  assertSameOrigin(c.req.raw, c.env);
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

  const cookieValue = await createSession(db, c.env, c.req.raw, {
    id: userId,
    username,
    displayName,
    avatarUpdatedAt: null,
  });
  setCookie(c, SESSION_COOKIE, cookieValue, sessionCookieOptions(c.req.raw));
  const payload: AuthResponse = { user: toUserDto({ id: userId, username, displayName }) };
  return c.json(payload, 201);
});

authRoutes.post("/auth/login", async (c) => {
  assertSameOrigin(c.req.raw, c.env);
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
  // 密码校验通过后再看禁用状态：对不存在与已禁用的账号保持同等的 PBKDF2 开销。
  if (user.disabledAt) {
    throw new HttpError(403, "disabled", "账号已被禁用，请联系管理员");
  }

  await clearRateLimit(c.env, "login:user", username);

  const cookieValue = await createSession(db, c.env, c.req.raw, {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUpdatedAt: user.avatarUpdatedAt ?? null,
  });
  setCookie(c, SESSION_COOKIE, cookieValue, sessionCookieOptions(c.req.raw));
  const payload: AuthResponse = { user: toUserDto(user) };
  return c.json(payload);
});

authRoutes.post("/auth/logout", async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  await destroySession(c.get("db"), c.env, getCookie(c, SESSION_COOKIE) ?? null);
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: new URL(c.req.url).protocol === "https:" });
  const payload: OkResponse = { ok: true };
  return c.json(payload);
});

authRoutes.post("/auth/password", requireSession, refreshSessionCookie, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
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

  const payload: OkResponse = { ok: true };
  return c.json(payload);
});
