/**
 * 行程数据的解析、校验与序列化。
 * 约定：总里程（totalKm）是统计口径；分段里程（legs[].km）可以留空。
 */

import type { TripRow } from "../../db/schema";
import { HttpError } from "./http";

export interface Leg {
  from: string;
  to: string;
  km: number | null;
}

export interface TripInput {
  date: string;
  nodes: string[];
  legs: Leg[];
  totalKm: number | null;
  note: string | null;
}

export interface TripDto {
  id: string;
  date: string;
  nodes: string[];
  legs: Leg[];
  totalKm: number | null;
  note: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NODES = 40;
const MAX_NODE_CHARS = 32;
const MAX_NOTE_CHARS = 300;
const MAX_KM = 100_000;
export type TripRecord = Pick<
  TripRow,
  "id" | "date" | "nodes" | "legs" | "totalKm" | "note" | "source" | "createdAt" | "updatedAt"
>;

/** 待插入的行程行：字段齐备，可直接交给 Drizzle 与序列化。 */
export interface TripInsert extends TripRecord {
  userId: string;
}

export const MAX_BULK_TRIPS = 500;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDate(raw: unknown): string {
  if (typeof raw !== "string" || !DATE_PATTERN.test(raw)) {
    throw new HttpError(400, "invalid_date", "日期格式应为 YYYY-MM-DD");
  }
  const time = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== raw) {
    throw new HttpError(400, "invalid_date", "日期无效");
  }
  return raw;
}

function parseNodeName(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError(400, "invalid_node", "节点名称必须是字符串");
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new HttpError(400, "invalid_node", "节点名称不能为空");
  if ([...name].length > MAX_NODE_CHARS) {
    throw new HttpError(400, "invalid_node", `节点名称最多 ${MAX_NODE_CHARS} 个字`);
  }
  return name;
}

function parseKm(raw: unknown, label: string): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value) || value < 0 || value > MAX_KM) {
    throw new HttpError(400, "invalid_km", `${label}必须是 0 - ${MAX_KM} 之间的数字`);
  }
  return Math.round(value * 100) / 100;
}

function parseNote(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new HttpError(400, "invalid_note", "备注必须是字符串");
  const note = raw.trim();
  if (!note) return null;
  if ([...note].length > MAX_NOTE_CHARS) {
    throw new HttpError(400, "invalid_note", `备注最多 ${MAX_NOTE_CHARS} 个字`);
  }
  return note;
}

export function parseTripInput(raw: unknown): TripInput {
  if (!isPlainObject(raw)) throw new HttpError(400, "invalid_trip", "行程数据格式不正确");

  const date = parseDate(raw.date);

  if (!Array.isArray(raw.nodes)) throw new HttpError(400, "invalid_trip", "nodes 必须是数组");
  if (raw.nodes.length === 0 || raw.nodes.length > MAX_NODES) {
    throw new HttpError(400, "invalid_trip", `节点数量需在 1 - ${MAX_NODES} 之间`);
  }
  const nodes = raw.nodes.map(parseNodeName);

  let legs: Leg[] = [];
  if (raw.legs !== undefined && raw.legs !== null) {
    if (!Array.isArray(raw.legs)) throw new HttpError(400, "invalid_trip", "legs 必须是数组");
    if (raw.legs.length !== Math.max(0, nodes.length - 1)) {
      throw new HttpError(400, "invalid_trip", "legs 数量与节点数量不匹配");
    }
    legs = raw.legs.map((entry, index) => {
      if (!isPlainObject(entry)) {
        throw new HttpError(400, "invalid_trip", `第 ${index + 1} 段数据格式不正确`);
      }
      return {
        from: nodes[index] ?? "",
        to: nodes[index + 1] ?? "",
        km: parseKm(entry.km, `第 ${index + 1} 段里程`),
      };
    });
  } else {
    legs = nodes.slice(0, -1).map((from, index) => ({ from, to: nodes[index + 1] ?? "", km: null }));
  }

  let totalKm = parseKm(raw.totalKm, "总里程");
  const allLegsFilled = legs.length > 0 && legs.every((leg) => leg.km !== null);
  if (totalKm === null && allLegsFilled) {
    totalKm = Math.round(legs.reduce((sum, leg) => sum + (leg.km ?? 0), 0) * 100) / 100;
  }

  return { date, nodes, legs, totalKm, note: parseNote(raw.note) };
}

export function tripRowFromInput(
  input: TripInput,
  options: { userId: string; source?: string; id?: string; now?: string },
): TripInsert {
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.id ?? crypto.randomUUID(),
    userId: options.userId,
    date: input.date,
    nodes: JSON.stringify(input.nodes),
    legs: JSON.stringify(input.legs),
    totalKm: input.totalKm,
    note: input.note,
    source: options.source === "import" ? "import" : "manual",
    createdAt: now,
    updatedAt: now,
  };
}

export function serializeTrip(row: TripRecord): TripDto {
  return {
    id: row.id,
    date: row.date,
    nodes: JSON.parse(row.nodes) as string[],
    legs: JSON.parse(row.legs) as Leg[],
    totalKm: row.totalKm,
    note: row.note,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 导入去重键：同一天、同一节点链、同一总里程视为重复。 */
export function tripDedupeKey(date: string, nodes: string[], totalKm: number | null): string {
  return `${date}|${nodes.join("\u0001")}|${totalKm === null ? "" : totalKm}`;
}
