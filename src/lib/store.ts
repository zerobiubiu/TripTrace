/**
 * D1 数据访问层：用户、会话、行程。所有 SQL 集中在此，路由层不直接拼 SQL。
 */

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  pwd_algo: string;
  pwd_salt: string;
  pwd_hash: string;
  pwd_iterations: number;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  last_seen_at: string;
  extended_at: string;
  expires_at: string;
  user_agent: string | null;
  /** JOIN users 时带出。 */
  username?: string;
  display_name?: string;
}

export interface TripRow {
  id: string;
  user_id: string;
  date: string;
  nodes: string;
  legs: string;
  total_km: number | null;
  note: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

const USER_COLUMNS =
  "id, username, display_name, pwd_algo, pwd_salt, pwd_hash, pwd_iterations, created_at, updated_at";

export async function findUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  return await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`)
    .bind(username)
    .first<UserRow>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return await db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first<UserRow>();
}

export async function insertUser(db: D1Database, user: UserRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, username, display_name, pwd_algo, pwd_salt, pwd_hash, pwd_iterations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      user.id,
      user.username,
      user.display_name,
      user.pwd_algo,
      user.pwd_salt,
      user.pwd_hash,
      user.pwd_iterations,
      user.created_at,
      user.updated_at,
    )
    .run();
}

export async function updateUserPassword(
  db: D1Database,
  userId: string,
  values: { salt: string; hash: string; iterations: number; algo: string; updatedAt: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET pwd_algo = ?, pwd_salt = ?, pwd_hash = ?, pwd_iterations = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(values.algo, values.salt, values.hash, values.iterations, values.updatedAt, userId)
    .run();
}

export async function insertSession(db: D1Database, row: SessionRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, extended_at, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.user_id,
      row.token_hash,
      row.created_at,
      row.last_seen_at,
      row.extended_at,
      row.expires_at,
      row.user_agent,
    )
    .run();
}

export async function findSessionWithUser(db: D1Database, tokenHash: string): Promise<SessionRow | null> {
  return await db
    .prepare(
      `SELECT s.id, s.user_id, s.token_hash, s.created_at, s.last_seen_at, s.extended_at, s.expires_at, s.user_agent,
              u.username, u.display_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<SessionRow>();
}

export async function touchSession(
  db: D1Database,
  sessionId: string,
  lastSeenAt: string,
  expiresAt: string,
  extendedAt: string,
): Promise<void> {
  await db
    .prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ?, extended_at = ? WHERE id = ?`)
    .bind(lastSeenAt, expiresAt, extendedAt, sessionId)
    .run();
}

export async function deleteSessionByHash(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
}

export async function deleteSessionById(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
}

export async function deleteUserSessionsExcept(
  db: D1Database,
  userId: string,
  keepSessionId: string,
): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM sessions WHERE user_id = ? AND id <> ?`)
    .bind(userId, keepSessionId)
    .run();
  return result.meta.changes ?? 0;
}

const TRIP_COLUMNS =
  "id, user_id, date, nodes, legs, total_km, note, source, created_at, updated_at";

export async function listTrips(db: D1Database, userId: string): Promise<TripRow[]> {
  const result = await db
    .prepare(`SELECT ${TRIP_COLUMNS} FROM trips WHERE user_id = ? ORDER BY date DESC, created_at DESC`)
    .bind(userId)
    .all<TripRow>();
  return result.results ?? [];
}

export async function findTrip(db: D1Database, userId: string, tripId: string): Promise<TripRow | null> {
  return await db
    .prepare(`SELECT ${TRIP_COLUMNS} FROM trips WHERE user_id = ? AND id = ?`)
    .bind(userId, tripId)
    .first<TripRow>();
}

export async function listTripsInRange(
  db: D1Database,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<TripRow[]> {
  const result = await db
    .prepare(
      `SELECT ${TRIP_COLUMNS} FROM trips WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC`,
    )
    .bind(userId, fromDate, toDate)
    .all<TripRow>();
  return result.results ?? [];
}

const INSERT_TRIP_SQL = `INSERT INTO trips (id, user_id, date, nodes, legs, total_km, note, source, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertStatement(db: D1Database, row: TripRow): D1PreparedStatement {
  return db
    .prepare(INSERT_TRIP_SQL)
    .bind(
      row.id,
      row.user_id,
      row.date,
      row.nodes,
      row.legs,
      row.total_km,
      row.note,
      row.source,
      row.created_at,
      row.updated_at,
    );
}

export async function insertTrip(db: D1Database, row: TripRow): Promise<void> {
  await insertStatement(db, row).run();
}

/** 批量插入：每 100 条一个 batch，避免单次请求过大。 */
export async function batchInsertTrips(db: D1Database, rows: TripRow[]): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db.batch(chunk.map((row) => insertStatement(db, row)));
  }
}

export async function updateTrip(
  db: D1Database,
  row: Pick<TripRow, "id" | "user_id" | "date" | "nodes" | "legs" | "total_km" | "note" | "updated_at">,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE trips SET date = ?, nodes = ?, legs = ?, total_km = ?, note = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(row.date, row.nodes, row.legs, row.total_km, row.note, row.updated_at, row.id, row.user_id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteTrip(db: D1Database, userId: string, tripId: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM trips WHERE id = ? AND user_id = ?`).bind(tripId, userId).run();
  return (result.meta.changes ?? 0) > 0;
}
