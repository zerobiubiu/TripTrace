/**
 * 数据访问层（Drizzle）：用户、会话、行程。所有 ORM 查询集中在此，路由层不直接拼查询。
 */

import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { sessions, trips, users } from "../../db/schema";
import type { NewSession, NewTrip, NewUser, SessionRow, TripRow, UserRow } from "../../db/schema";
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
