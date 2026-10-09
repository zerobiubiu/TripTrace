/**
 * Drizzle 表定义：schema 的唯一来源。
 * 与 `migrations/0001_init.sql` 等价（该迁移已在本地与线上应用），
 * 之后的变更用 `bun run db:generate` 生成 SQL，再由 wrangler 应用。
 */

import { desc } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  pwdAlgo: text("pwd_algo").notNull().default("pbkdf2-sha256"),
  pwdSalt: text("pwd_salt").notNull(),
  pwdHash: text("pwd_hash").notNull(),
  pwdIterations: integer("pwd_iterations").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  /** 非空表示已被管理员禁用：拒绝登录并使其所有会话失效。 */
  disabledAt: text("disabled_at"),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    extendedAt: text("extended_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    userAgent: text("user_agent"),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD（用户本地日期）。 */
    date: text("date").notNull(),
    /** JSON 数组：途经节点，按顺序。 */
    nodes: text("nodes").notNull(),
    /** JSON 数组：[{from,to,km|null}]，与 nodes 相邻段对齐。 */
    legs: text("legs").notNull().default("[]"),
    /** 总里程；NULL 表示未填。 */
    totalKm: real("total_km"),
    note: text("note"),
    /** manual | import */
    source: text("source").notNull().default("manual"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("trips_user_date_idx").on(table.userId, desc(table.date), desc(table.createdAt))],
);

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type TripRow = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
