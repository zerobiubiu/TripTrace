/** D1 + Drizzle 客户端。绑定声明由 `wrangler types` 生成（CloudflareBindings）。 */

import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export type Db = DrizzleD1Database<typeof schema>;

export function createDb(d1: D1Database): Db {
  return drizzle(d1, { schema });
}
