/**
 * 历史数据索引与建议引擎（纯函数）。
 * 输入行程数组，产出：节点名补全、分段里程建议、整条路线匹配、最近路线、年度统计。
 */

import type { Leg, Trip } from "../types";
import { normalizeName } from "./format";

const KEY_SEPARATOR = "\u0000";

function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

function routeKey(nodes: string[]): string {
  return nodes.map(nameKey).join(KEY_SEPARATOR);
}

function legKey(from: string, to: string): string {
  return `${nameKey(from)}${KEY_SEPARATOR}${nameKey(to)}`;
}

export interface NodeSuggestion {
  name: string;
  count: number;
  lastDate: string;
}

export interface LegSuggestion {
  km: number;
  count: number;
  lastDate: string;
  reversed: boolean;
}

export interface RouteHit {
  nodes: string[];
  totalKm: number | null;
  legs: Leg[];
  date: string;
  updatedAt: string;
  count: number;
}

interface LegStat {
  km: number;
  count: number;
  lastDate: string;
}

export interface SuggestIndex {
  nodes: Map<string, NodeSuggestion>;
  legSuggestions: Map<string, LegStat>;
  routes: Map<string, RouteHit>;
}

function pickMostUsed(candidates: LegStat[]): LegStat | null {
  let best: LegStat | null = null;
  for (const candidate of candidates) {
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.count > best.count) {
      best = candidate;
      continue;
    }
    if (candidate.count === best.count && candidate.lastDate > best.lastDate) best = candidate;
  }
  return best;
}

export function buildIndex(trips: Trip[]): SuggestIndex {
  const nodes = new Map<string, NodeSuggestion>();
  const legStats = new Map<string, Map<number, LegStat>>();
  const routes = new Map<string, RouteHit>();

  for (const trip of trips) {
    const nodeList = (trip.nodes ?? []).map(normalizeName).filter(Boolean);

    for (const name of nodeList) {
      const key = nameKey(name);
      const entry = nodes.get(key) ?? { name, count: 0, lastDate: "" };
      entry.count += 1;
      if (trip.date > entry.lastDate) entry.lastDate = trip.date;
      nodes.set(key, entry);
    }

    for (const leg of trip.legs ?? []) {
      if (leg.km === null || leg.km === undefined) continue;
      const key = legKey(leg.from, leg.to);
      const byKm = legStats.get(key) ?? new Map<number, LegStat>();
      const stat = byKm.get(leg.km) ?? { km: leg.km, count: 0, lastDate: "" };
      stat.count += 1;
      if (trip.date > stat.lastDate) stat.lastDate = trip.date;
      byKm.set(leg.km, stat);
      legStats.set(key, byKm);
    }

    const key = routeKey(nodeList);
    const existing = routes.get(key);
    const candidate: RouteHit = {
      nodes: nodeList,
      totalKm: trip.totalKm,
      legs: (trip.legs ?? []).map((leg) => ({ from: leg.from, to: leg.to, km: leg.km })),
      date: trip.date,
      updatedAt: trip.updatedAt ?? trip.createdAt ?? "",
      count: (existing?.count ?? 0) + 1,
    };
    if (!existing || `${candidate.date}${candidate.updatedAt}` >= `${existing.date}${existing.updatedAt}`) {
      routes.set(key, candidate);
    } else {
      routes.set(key, { ...existing, count: candidate.count });
    }
  }

  const legSuggestions = new Map<string, LegStat>();
  for (const [key, byKm] of legStats) {
    const best = pickMostUsed([...byKm.values()]);
    if (best) legSuggestions.set(key, best);
  }

  return { nodes, legSuggestions, routes };
}

export function suggestNodeNames(
  index: SuggestIndex | null,
  query: string,
  exclude: string[] = [],
  limit = 8,
): NodeSuggestion[] {
  if (!index) return [];
  const normalizedQuery = nameKey(query);
  const excluded = new Set(exclude.map(nameKey));
  const all = [...index.nodes.values()]
    .filter((entry) => !excluded.has(nameKey(entry.name)))
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1));

  if (!normalizedQuery) return all.slice(0, limit);

  const starts: NodeSuggestion[] = [];
  const contains: NodeSuggestion[] = [];
  for (const entry of all) {
    const key = nameKey(entry.name);
    if (key.startsWith(normalizedQuery)) starts.push(entry);
    else if (key.includes(normalizedQuery)) contains.push(entry);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** 分段里程建议：同方向历史优先；没有时退回反方向并标记 reversed。 */
export function suggestLegKm(index: SuggestIndex | null, from: string, to: string): LegSuggestion | null {
  if (!index) return null;
  const forward = index.legSuggestions.get(legKey(from, to));
  if (forward) return { ...forward, reversed: false };

  const backward = index.legSuggestions.get(legKey(to, from));
  if (backward) return { ...backward, reversed: true };

  return null;
}

export function findRoute(index: SuggestIndex | null, nodes: string[]): RouteHit | null {
  if (!index || nodes.length < 2) return null;
  return index.routes.get(routeKey(nodes.map(normalizeName))) ?? null;
}

export function recentRoutes(index: SuggestIndex | null, trips: Trip[], limit = 6): RouteHit[] {
  const seen = new Set<string>();
  const list = [...trips].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const result: RouteHit[] = [];
  for (const trip of list) {
    const nodes = (trip.nodes ?? []).map(normalizeName).filter(Boolean);
    if (nodes.length < 2) continue;
    const key = routeKey(nodes);
    if (seen.has(key)) continue;
    seen.add(key);
    const stat = index?.routes.get(key);
    result.push({
      nodes,
      totalKm: trip.totalKm,
      legs: trip.legs ?? [],
      date: trip.date,
      updatedAt: trip.updatedAt,
      count: stat?.count ?? 1,
    });
    if (result.length >= limit) break;
  }
  return result;
}

export interface MonthStat {
  month: number;
  km: number;
  tripCount: number;
  dayCount: number;
}

export interface YearStats {
  year: number;
  totalKm: number;
  tripCount: number;
  dayCount: number;
  missingKm: number;
  months: MonthStat[];
  topLegs: Array<{ from: string; to: string; km: number; count: number }>;
}

/** 年度统计：总额、次数、记录天数、月度分布、高频路段。 */
export function computeStats(trips: Trip[], year: number): YearStats {
  const prefix = `${year}-`;
  const months = Array.from({ length: 12 }, () => ({ km: 0, tripCount: 0, days: new Set<string>() }));
  const legTotals = new Map<string, { from: string; to: string; km: number; count: number; total: number }>();
  let totalKm = 0;
  let tripCount = 0;
  let missingKm = 0;
  const days = new Set<string>();

  for (const trip of trips) {
    if (!trip.date.startsWith(prefix)) continue;
    tripCount += 1;
    days.add(trip.date);
    if (trip.totalKm === null || trip.totalKm === undefined) missingKm += 1;
    else totalKm += trip.totalKm;

    const monthIndex = Number.parseInt(trip.date.slice(5, 7), 10) - 1;
    const bucket = months[monthIndex];
    if (bucket) {
      if (trip.totalKm !== null && trip.totalKm !== undefined) bucket.km += trip.totalKm;
      bucket.tripCount += 1;
      bucket.days.add(trip.date);
    }

    for (const leg of trip.legs ?? []) {
      if (leg.km === null || leg.km === undefined) continue;
      const key = legKey(leg.from, leg.to);
      const entry = legTotals.get(key) ?? { from: leg.from, to: leg.to, km: leg.km, count: 0, total: 0 };
      entry.count += 1;
      entry.total += leg.km;
      legTotals.set(key, entry);
    }
  }

  const topLegs = [...legTotals.values()]
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 5)
    .map((entry) => ({ from: entry.from, to: entry.to, km: entry.km, count: entry.count }));

  return {
    year,
    totalKm: Math.round(totalKm * 100) / 100,
    tripCount,
    dayCount: days.size,
    missingKm,
    months: months.map((month, index) => ({
      month: index + 1,
      km: Math.round(month.km * 100) / 100,
      tripCount: month.tripCount,
      dayCount: month.days.size,
    })),
    topLegs,
  };
}
