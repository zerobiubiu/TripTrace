/**
 * 查询内核：时间范围、筛选与多维聚合（纯函数，不依赖 React）。
 *
 * 汇总页（集中查询）与记录页（明细查询）共用这一份实现——**同一范围下两边的条数与合计里程必须相等**，
 * 否则台账立刻失去可信度。任何口径改动都改在这里，不要在视图里另写一份。
 *
 * 口径约定：
 * - 合计里程只累加 `totalKm` 有值的行程；`totalKm` 为空的行单独计「未填里程」条数。
 * - 分段（相邻节点对）**不区分方向**：`家 ⇄ 圣润` 与 `圣润 → 家` 合成一条，与「同一条路往返里程相同」一致。
 * - 日期一律按 `YYYY-MM-DD` 字符串比较（ISO 字符串序即时间序）。
 */

import type { Trip } from "../types";
import { formatDateLabel, formatMonthLabel, normalizeName, pad2, todayIso } from "./format";
import { nameKey, routeKey } from "./suggest";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 行程的节点名（已归一化、去掉空名）。 */
export function nodesOf(trip: Trip): string[] {
  return (trip.nodes ?? []).map(normalizeName).filter(Boolean);
}

/** 无序分段键：同一条路的两个方向合成一条（与 `suggest.ts` 的按方向键是两回事，别混用）。 */
export function legPairKey(from: string, to: string): string {
  return [nameKey(from), nameKey(to)].sort().join("\u0000");
}

export function legPairLabel(from: string, to: string): string {
  const left = normalizeName(from);
  const right = normalizeName(to);
  return nameKey(left) <= nameKey(right) ? `${left} ⇄ ${right}` : `${right} ⇄ ${left}`;
}

/* ------------------------------------------------------------------ 时间范围 */

export type RangePreset = "month" | "year" | "last-year" | "all" | "custom";

export interface DateRange {
  preset: RangePreset;
  /** 含边界；null 表示该侧不限（只有「全部」会两侧都不限） */
  from: string | null;
  to: string | null;
}

export const RANGE_PRESETS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: "month", label: "本月" },
  { value: "year", label: "本年" },
  { value: "last-year", label: "去年" },
  { value: "all", label: "全部" },
  { value: "custom", label: "自定义" },
];

export interface RangeOptions {
  today?: string;
  customFrom?: string | null;
  customTo?: string | null;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 把快捷档解析成具体起止日期；「自定义」直接沿用调用方给的两端。 */
export function resolveRange(preset: RangePreset, options: RangeOptions = {}): DateRange {
  const today = options.today ?? todayIso();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (preset) {
    case "month":
      return {
        preset,
        from: `${year}-${pad2(month)}-01`,
        to: `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`,
      };
    case "year":
      return { preset, from: `${year}-01-01`, to: `${year}-12-31` };
    case "last-year":
      return { preset, from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "all":
      return { preset, from: null, to: null };
    case "custom":
      return { preset, from: options.customFrom ?? null, to: options.customTo ?? null };
  }
}

export function inRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/** 给用户看的范围文案：同年只说一次年份，避免「2026年…2026年…」这种啰嗦读数。 */
export function rangeLabel(range: DateRange): string {
  if (!range.from && !range.to) return "全部时间";
  if (range.from && range.to) {
    if (range.from === range.to) return formatDateLabel(range.from);
    if (range.from.slice(0, 4) === range.to.slice(0, 4)) {
      const year = range.from.slice(0, 4);
      const fromLabel = `${Number(range.from.slice(5, 7))}月${Number(range.from.slice(8, 10))}日`;
      const toLabel = `${Number(range.to.slice(5, 7))}月${Number(range.to.slice(8, 10))}日`;
      return `${year}年${fromLabel} – ${toLabel}`;
    }
    return `${formatDateLabel(range.from)} – ${formatDateLabel(range.to)}`;
  }
  if (range.from) return `${formatDateLabel(range.from)} 起`;
  if (range.to) return `至 ${formatDateLabel(range.to)}`;
  return "全部时间";
}

/* ------------------------------------------------------------------ 筛选 */

/** 下钻约束：来自汇总页某一行，落在记录页上就是一个可移除的条件。 */
export type Constraint =
  | { kind: "route"; key: string; label: string }
  | { kind: "node"; key: string; label: string }
  | { kind: "leg"; key: string; label: string };

export interface TripFilter {
  range: DateRange;
  /** 关键词：匹配节点名或备注（不区分大小写） */
  keyword: string;
  missingOnly: boolean;
  constraints: Constraint[];
}

export function createFilter(range: DateRange): TripFilter {
  return { range, keyword: "", missingOnly: false, constraints: [] };
}

function matchConstraint(trip: Trip, constraint: Constraint): boolean {
  switch (constraint.kind) {
    case "route":
      return routeKey(nodesOf(trip)) === constraint.key;
    case "node":
      return nodesOf(trip).some((name) => nameKey(name) === constraint.key);
    case "leg":
      return (trip.legs ?? []).some((leg) => legPairKey(leg.from, leg.to) === constraint.key);
  }
}

export function filterTrips(trips: Trip[], filter: TripFilter): Trip[] {
  const keyword = filter.keyword.trim().toLowerCase();
  return trips.filter((trip) => {
    if (!inRange(trip.date, filter.range)) return false;
    if (filter.missingOnly && trip.totalKm !== null && trip.totalKm !== undefined) return false;
    for (const constraint of filter.constraints) {
      if (!matchConstraint(trip, constraint)) return false;
    }
    if (keyword) {
      const haystack = [...nodesOf(trip), trip.note ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

export function hasConditions(filter: TripFilter): boolean {
  return filter.missingOnly || filter.keyword.trim() !== "" || filter.constraints.length > 0;
}

/** 记录页排序：最新在前（同日保持接口原顺序）/ 里程从高到低（未填里程排最后）。 */
export type RecordSort = "recent" | "km";

export function sortTrips(trips: Trip[], sort: RecordSort): Trip[] {
  if (sort === "recent") {
    return [...trips].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  return [...trips].sort((a, b) => {
    const left = a.totalKm ?? -1;
    const right = b.totalKm ?? -1;
    if (left !== right) return right - left;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
}

/* ------------------------------------------------------------------ 读数 */

export interface RangeSummary {
  totalKm: number;
  tripCount: number;
  dayCount: number;
  missingKm: number;
  /** 单次均值：总里程 ÷ 有里程的条数（没有可用里程时为 null） */
  avgKm: number | null;
  lastDate: string | null;
}

export function summarize(trips: Trip[]): RangeSummary {
  let totalKm = 0;
  let missingKm = 0;
  let pricedCount = 0;
  let lastDate: string | null = null;
  const days = new Set<string>();

  for (const trip of trips) {
    days.add(trip.date);
    if (!lastDate || trip.date > lastDate) lastDate = trip.date;
    if (trip.totalKm === null || trip.totalKm === undefined) {
      missingKm += 1;
      continue;
    }
    pricedCount += 1;
    totalKm += trip.totalKm;
  }

  return {
    totalKm: round2(totalKm),
    tripCount: trips.length,
    dayCount: days.size,
    missingKm,
    avgKm: pricedCount > 0 ? round2(totalKm / pricedCount) : null,
    lastDate,
  };
}

/* ------------------------------------------------------------------ 多维聚合 */

export type Dimension = "month" | "route" | "leg" | "node";
export type SortKey = "km" | "count" | "trips";

export const DIMENSIONS: ReadonlyArray<{ value: Dimension; label: string }> = [
  { value: "month", label: "按月份" },
  { value: "route", label: "按路线" },
  { value: "leg", label: "按分段" },
  { value: "node", label: "按节点" },
];

/** 每个维度可选的两种排序；`km` 的含义随维度变化（合计里程 / 单次里程），所以标签按维度给。 */
export const SORT_OPTIONS: Record<Dimension, ReadonlyArray<{ value: SortKey; label: string }>> = {
  month: [
    { value: "km", label: "按里程" },
    { value: "trips", label: "按次数" },
  ],
  route: [
    { value: "km", label: "按里程" },
    { value: "trips", label: "按次数" },
  ],
  leg: [
    { value: "count", label: "按次数" },
    { value: "km", label: "按合计" },
  ],
  node: [
    { value: "count", label: "按次数" },
    { value: "trips", label: "按行程" },
  ],
};

export const DEFAULT_SORT: Record<Dimension, SortKey> = {
  month: "km",
  route: "km",
  leg: "count",
  node: "count",
};

export interface MonthRow {
  key: string;
  label: string;
  km: number;
  tripCount: number;
  dayCount: number;
}

export interface RouteRow {
  key: string;
  label: string;
  tripCount: number;
  km: number;
  avgKm: number | null;
  lastDate: string;
}

export interface LegRow {
  key: string;
  label: string;
  /** 该分段出现的次数（一趟里来回各一次就算两次） */
  count: number;
  /** 含该分段的行程数：下钻到记录页看到的条数就是它 */
  tripCount: number;
  /** 最常见的一次里程（同一条路通常固定，比均值更贴近用户记的数字） */
  typicalKm: number | null;
  totalKm: number;
  lastDate: string;
}

export interface NodeRow {
  key: string;
  label: string;
  count: number;
  tripCount: number;
  lastDate: string;
}

function byNumber(a: number, b: number, tieBreak: () => number): number {
  return a !== b ? b - a : tieBreak();
}

function newerFirst(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

export function aggregateMonths(trips: Trip[], sort: SortKey = DEFAULT_SORT.month): MonthRow[] {
  const buckets = new Map<string, { km: number; tripCount: number; days: Set<string> }>();
  for (const trip of trips) {
    const key = trip.date.slice(0, 7);
    const bucket = buckets.get(key) ?? { km: 0, tripCount: 0, days: new Set<string>() };
    bucket.tripCount += 1;
    bucket.days.add(trip.date);
    if (trip.totalKm !== null && trip.totalKm !== undefined) bucket.km += trip.totalKm;
    buckets.set(key, bucket);
  }
  const rows: MonthRow[] = [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: formatMonthLabel(key),
    km: round2(bucket.km),
    tripCount: bucket.tripCount,
    dayCount: bucket.days.size,
  }));
  return rows.sort((a, b) =>
    sort === "trips" ? byNumber(a.tripCount, b.tripCount, () => newerFirst(a.key, b.key)) : byNumber(a.km, b.km, () => newerFirst(a.key, b.key)),
  );
}

export function aggregateRoutes(trips: Trip[], sort: SortKey = DEFAULT_SORT.route): RouteRow[] {
  const buckets = new Map<string, { label: string; tripCount: number; km: number; pricedCount: number; lastDate: string }>();
  for (const trip of trips) {
    const nodes = nodesOf(trip);
    const key = routeKey(nodes);
    const bucket = buckets.get(key) ?? {
      label: nodes.join(" → "),
      tripCount: 0,
      km: 0,
      pricedCount: 0,
      lastDate: "",
    };
    bucket.tripCount += 1;
    if (trip.totalKm !== null && trip.totalKm !== undefined) {
      bucket.km += trip.totalKm;
      bucket.pricedCount += 1;
    }
    if (trip.date > bucket.lastDate) bucket.lastDate = trip.date;
    buckets.set(key, bucket);
  }
  const rows: RouteRow[] = [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: bucket.label || "（无节点）",
    tripCount: bucket.tripCount,
    km: round2(bucket.km),
    avgKm: bucket.pricedCount > 0 ? round2(bucket.km / bucket.pricedCount) : null,
    lastDate: bucket.lastDate,
  }));
  return rows.sort((a, b) =>
    sort === "trips" ? byNumber(a.tripCount, b.tripCount, () => newerFirst(a.lastDate, b.lastDate)) : byNumber(a.km, b.km, () => newerFirst(a.lastDate, b.lastDate)),
  );
}

export function aggregateLegs(trips: Trip[], sort: SortKey = DEFAULT_SORT.leg): LegRow[] {
  const buckets = new Map<
    string,
    { label: string; count: number; trips: Set<string>; totalKm: number; byKm: Map<number, number>; lastDate: string }
  >();
  for (const trip of trips) {
    for (const leg of trip.legs ?? []) {
      const key = legPairKey(leg.from, leg.to);
      const bucket = buckets.get(key) ?? {
        label: legPairLabel(leg.from, leg.to),
        count: 0,
        trips: new Set<string>(),
        totalKm: 0,
        byKm: new Map<number, number>(),
        lastDate: "",
      };
      bucket.count += 1;
      bucket.trips.add(trip.id);
      if (leg.km !== null && leg.km !== undefined) {
        bucket.totalKm += leg.km;
        bucket.byKm.set(leg.km, (bucket.byKm.get(leg.km) ?? 0) + 1);
      }
      if (trip.date > bucket.lastDate) bucket.lastDate = trip.date;
      buckets.set(key, bucket);
    }
  }
  const rows: LegRow[] = [...buckets.entries()].map(([key, bucket]) => {
    let typicalKm: number | null = null;
    let bestCount = 0;
    for (const [km, count] of bucket.byKm) {
      if (count > bestCount || (count === bestCount && typicalKm !== null && km > typicalKm)) {
        typicalKm = km;
        bestCount = count;
      }
    }
    return {
      key,
      label: bucket.label,
      count: bucket.count,
      tripCount: bucket.trips.size,
      typicalKm,
      totalKm: round2(bucket.totalKm),
      lastDate: bucket.lastDate,
    };
  });
  return rows.sort((a, b) =>
    sort === "km" ? byNumber(a.totalKm, b.totalKm, () => newerFirst(a.lastDate, b.lastDate)) : byNumber(a.count, b.count, () => newerFirst(a.lastDate, b.lastDate)),
  );
}

export function aggregateNodes(trips: Trip[], sort: SortKey = DEFAULT_SORT.node): NodeRow[] {
  const buckets = new Map<string, { label: string; count: number; tripCount: number; lastDate: string }>();
  for (const trip of trips) {
    const seen = new Set<string>();
    for (const name of nodesOf(trip)) {
      const key = nameKey(name);
      const bucket = buckets.get(key) ?? { label: name, count: 0, tripCount: 0, lastDate: "" };
      bucket.count += 1;
      if (!seen.has(key)) {
        seen.add(key);
        bucket.tripCount += 1;
      }
      if (trip.date > bucket.lastDate) bucket.lastDate = trip.date;
      buckets.set(key, bucket);
    }
  }
  const rows: NodeRow[] = [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: bucket.label,
    count: bucket.count,
    tripCount: bucket.tripCount,
    lastDate: bucket.lastDate,
  }));
  return rows.sort((a, b) =>
    sort === "trips" ? byNumber(a.tripCount, b.tripCount, () => newerFirst(a.lastDate, b.lastDate)) : byNumber(a.count, b.count, () => newerFirst(a.lastDate, b.lastDate)),
  );
}

/** 汇总行 → 记录页筛选：约束只保留这一行的条件，时间范围沿用当前范围（月份行例外，它自己就是范围）。 */
export function drillForRow(
  dimension: Dimension,
  row: MonthRow | RouteRow | LegRow | NodeRow,
  base: TripFilter,
): TripFilter {
  if (dimension === "month") {
    const month = row.key.slice(0, 7);
    return createFilter(
      resolveRange("custom", { customFrom: `${month}-01`, customTo: `${month}-${pad2(lastDayOfMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7))))}` }),
    );
  }
  const constraint: Constraint =
    dimension === "route"
      ? { kind: "route", key: row.key, label: (row as RouteRow).label }
      : dimension === "leg"
        ? { kind: "leg", key: row.key, label: (row as LegRow).label }
        : { kind: "node", key: row.key, label: (row as NodeRow).label };
  return { range: base.range, keyword: "", missingOnly: base.missingOnly, constraints: [constraint] };
}