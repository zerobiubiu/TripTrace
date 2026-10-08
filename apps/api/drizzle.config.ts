import { defineConfig } from "drizzle-kit";

/**
 * 迁移策略：
 * - schema 唯一来源是本文件指向的 `src/db/schema.ts`；
 * - `bun run db:generate` 生成的时间戳前缀 SQL 落在 `migrations/`，由 wrangler 负责应用
 *   （`bun run db:migrate:local|remote`），因此不使用 drizzle-kit migrate；
 * - `migrations/0001_init.sql` 是既有基线（线上已应用），drizzle 的 meta 快照与之等价。
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  migrations: {
    // 用时间戳前缀，避免与已有的 0001_init.sql 编号冲突
    prefix: "timestamp",
  },
});
