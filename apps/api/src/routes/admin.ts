/** 管理员接口：用户列表、启用/禁用、重置密码、删除账号。挂在 /api 下，全部需要管理员身份。 */

import { Hono, type Context } from "hono";
import type {
  AdminSetPasswordPayload,
  AdminUserListResponse,
  AdminUserPatch,
  AdminUserRow,
  OkResponse,
} from "@triptrace/contracts";
import { hashPassword, iterationsFromEnv, validatePassword } from "../lib/auth";
import { authedHandlers, clearUserSessionCache, requireAdmin, type AppEnv } from "../lib/context";
import { assertSameOrigin, HttpError, readJsonBody } from "../lib/http";
import * as store from "../lib/store";
import type { UserRow } from "../db/schema";

export const adminRoutes = new Hono<AppEnv>();

/** 取目标用户；指向自己 → 400（管理员不能禁用/删除自己），不存在 → 404。 */
async function loadTargetUser(c: Context<AppEnv>, targetId: string): Promise<UserRow> {
  if (targetId === c.get("user").id) {
    throw new HttpError(400, "self_forbidden", "不能对自己执行该操作");
  }
  const target = await store.findUserById(c.get("db"), targetId);
  if (!target) throw new HttpError(404, "user_not_found", "用户不存在");
  return target;
}

/** 用户列表：新建在前；行程与会话统计按用户聚合成一张表，缺省为 0 / null。 */
adminRoutes.get("/admin/users", ...authedHandlers, requireAdmin, async (c) => {
  const db = c.get("db");
  const [users, tripStats, sessionStats] = await Promise.all([
    store.listUsers(db),
    store.listTripStatsByUser(db),
    store.listSessionStatsByUser(db),
  ]);
  const tripsByUser = new Map(tripStats.map((stats) => [stats.userId, stats]));
  const sessionsByUser = new Map(sessionStats.map((stats) => [stats.userId, stats]));

  const rows: AdminUserRow[] = users.map((user) => {
    const trips = tripsByUser.get(user.id);
    const sessions = sessionsByUser.get(user.id);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
      tripCount: trips?.tripCount ?? 0,
      totalKm: trips?.totalKm ?? 0,
      sessionCount: sessions?.sessionCount ?? 0,
      lastSeenAt: sessions?.lastSeenAt ?? null,
      disabledAt: user.disabledAt,
    };
  });

  const payload: AdminUserListResponse = { users: rows };
  return c.json(payload);
});

/** 启用/禁用：禁用会立即作废该用户的全部会话（D1 + KV）。 */
adminRoutes.patch("/admin/users/:id", ...authedHandlers, requireAdmin, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const target = await loadTargetUser(c, c.req.param("id"));

  const body = await readJsonBody<Partial<AdminUserPatch> | null>(c.req.raw);
  const disabled = body?.disabled;
  if (typeof disabled !== "boolean") throw new HttpError(400, "invalid_input", "disabled 必须是布尔值");

  const db = c.get("db");
  const now = new Date().toISOString();
  await store.setUserDisabledAt(db, target.id, disabled ? now : null, now);

  if (disabled) {
    await store.deleteUserSessions(db, target.id);
    await clearUserSessionCache(c.env, target.id);
  }

  const payload: OkResponse = { ok: true };
  return c.json(payload);
});

/** 重置密码：沿用 PBKDF2 口径，改完清掉该用户全部会话（本人当前会话也会失效）。 */
adminRoutes.post("/admin/users/:id/password", ...authedHandlers, requireAdmin, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const db = c.get("db");

  const target = await store.findUserById(db, c.req.param("id"));
  if (!target) throw new HttpError(404, "user_not_found", "用户不存在");

  const body = await readJsonBody<Partial<AdminSetPasswordPayload> | null>(c.req.raw);
  const password = validatePassword(body?.password);
  const hash = await hashPassword(password, iterationsFromEnv(c.env));

  await store.updateUserPassword(db, target.id, {
    algo: hash.algo,
    salt: hash.salt,
    hash: hash.hash,
    iterations: hash.iterations,
    updatedAt: new Date().toISOString(),
  });
  await store.deleteUserSessions(db, target.id);
  await clearUserSessionCache(c.env, target.id);

  const payload: OkResponse = { ok: true };
  return c.json(payload);
});

/** 删除账号：级联删除其行程、会话，并清掉 KV 会话缓存。 */
adminRoutes.delete("/admin/users/:id", ...authedHandlers, requireAdmin, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const target = await loadTargetUser(c, c.req.param("id"));

  await store.deleteUserCascade(c.get("db"), target.id);
  await clearUserSessionCache(c.env, target.id);

  const payload: OkResponse = { ok: true };
  return c.json(payload);
});
