/**
 * 数据访问层（Drizzle）：用户、会话、行程。所有 ORM 查询集中在此，路由层不直接拼查询。
 */

import { and, count, desc, eq, gte, lte, max, ne, sql } from "drizzle-orm";
import { sessions, trips, users } from "../db/schema";
import type { NewSession, NewTrip, NewUser, SessionRow, TripRow, UserRow } from "../db/schema";
import type { Db } from "./db";

/** D1 单条语句最多 100 个绑定参数，trips 一行 10 列 → 每批 8 行。 */
const TRIP_INSERT_CHUNK = 8;

export async function findUserByUsername(db: Db, username: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(db: Db, id: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertUser(db: Db, values: NewUser): Promise<void> {
  await db.insert(users).values(values);
}

export async function updateUserPassword(
  db: Db,
  userId: string,
  values: { algo: string; salt: string; hash: string; iterations: number; updatedAt: string },
): Promise<void> {
  await db
    .update(users)
    .set({
      pwdAlgo: values.algo,
      pwdSalt: values.salt,
      pwdHash: values.hash,
      pwdIterations: values.iterations,
      updatedAt: values.updatedAt,
    })
    .where(eq(users.id, userId));
}

export async function insertSession(db: Db, values: NewSession): Promise<void> {
  await db.insert(sessions).values(values);
}

export async function updateUserDisplayName(
  db: Db,
  userId: string,
  displayName: string,
  updatedAt: string,
): Promise<void> {
  await db.update(users).set({ displayName, updatedAt }).where(eq(users.id, userId));
}

/** 设置或清除禁用标记（`null` 表示启用）。 */
export async function setUserDisabledAt(
  db: Db,
  userId: string,
  disabledAt: string | null,
  updatedAt: string,
): Promise<void> {
  await db.update(users).set({ disabledAt, updatedAt }).where(eq(users.id, userId));
}

/** 全部用户（新建在前），供管理员列表使用。 */
export async function listUsers(db: Db): Promise<UserRow[]> {
  return await db.select().from(users).orderBy(desc(users.createdAt));
}

export interface UserTripStats {
  userId: string;
  tripCount: number;
  /** 各行程 total_km 之和；为空的行不计入。 */
  totalKm: number;
}

/** 按用户聚合行程：条数与总里程（单条 SQL 聚合，避免逐用户查询）。 */
export async function listTripStatsByUser(db: Db): Promise<UserTripStats[]> {
  return await db
    .select({
      userId: trips.userId,
      tripCount: count(),
      totalKm: sql<number>`coalesce(sum(${trips.totalKm}), 0)`,
    })
    .from(trips)
    .groupBy(trips.userId);
}

export interface UserSessionStats {
  userId: string;
  sessionCount: number;
  lastSeenAt: string | null;
}

/** 按用户聚合会话：数量与最近活跃时间。 */
export async function listSessionStatsByUser(db: Db): Promise<UserSessionStats[]> {
  return await db
    .select({
      userId: sessions.userId,
      sessionCount: count(),
      lastSeenAt: max(sessions.lastSeenAt),
    })
    .from(sessions)
    .groupBy(sessions.userId);
}

/** 某用户的全部会话（最近活跃在前）。 */
export async function listUserSessions(db: Db, userId: string): Promise<SessionRow[]> {
  return await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeenAt));
}

/** 按 id 取会话并校验归属（跨用户访问一律视为不存在）。 */
export async function findSessionForUser(db: Db, userId: string, sessionId: string): Promise<SessionRow | null> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)))
    .limit(1);
  return rows[0] ?? null;
}

/** 删除某用户的全部会话（禁用、重置密码时使用）。 */
export async function deleteUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * 删除用户及其全部行程、会话。
 * 外键是级联的，这里仍显式逐表删除（每条语句只绑定 userId 一个参数，无参数上限风险），
 * 不依赖 D1 的外键开关。
 */
export async function deleteUserCascade(db: Db, userId: string): Promise<void> {
  await db.delete(trips).where(eq(trips.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

export type SessionWithUser = SessionRow & { user: UserRow };

export async function findSessionWithUser(db: Db, tokenHash: string): Promise<SessionWithUser | null> {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  return row ? { ...row.session, user: row.user } : null;
}

export async function touchSession(
  db: Db,
  sessionId: string,
  values: { lastSeenAt: string; expiresAt: string; extendedAt: string },
): Promise<void> {
  await db
    .update(sessions)
    .set({ lastSeenAt: values.lastSeenAt, expiresAt: values.expiresAt, extendedAt: values.extendedAt })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSessionByHash(db: Db, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteSessionById(db: Db, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessionsExcept(db: Db, userId: string, keepSessionId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

export async function listTrips(db: Db, userId: string): Promise<TripRow[]> {
  return await db
    .select()
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(desc(trips.date), desc(trips.createdAt));
}

export async function findTrip(db: Db, userId: string, tripId: string): Promise<TripRow | null> {
  const rows = await db
    .select()
    .from(trips)
    .where(and(eq(trips.userId, userId), eq(trips.id, tripId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listTripsInRange(db: Db, userId: string, fromDate: string, toDate: string): Promise<TripRow[]> {
  return await db
    .select()
    .from(trips)
    .where(and(eq(trips.userId, userId), gte(trips.date, fromDate), lte(trips.date, toDate)))
    .orderBy(trips.date);
}

export async function insertTrip(db: Db, values: NewTrip): Promise<void> {
  await db.insert(trips).values(values);
}

/** 批量插入：按 D1 绑定参数上限分批，避免单条语句参数过多。 */
export async function insertTrips(db: Db, rows: NewTrip[]): Promise<void> {
  for (let i = 0; i < rows.length; i += TRIP_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + TRIP_INSERT_CHUNK);
    if (chunk.length > 0) await db.insert(trips).values(chunk);
  }
}

export async function updateTrip(
  db: Db,
  userId: string,
  tripId: string,
  values: Pick<NewTrip, "date" | "nodes" | "legs" | "totalKm" | "note" | "updatedAt">,
): Promise<void> {
  await db
    .update(trips)
    .set(values)
    .where(and(eq(trips.userId, userId), eq(trips.id, tripId)));
}

export async function deleteTrip(db: Db, userId: string, tripId: string): Promise<void> {
  await db.delete(trips).where(and(eq(trips.userId, userId), eq(trips.id, tripId)));
}
