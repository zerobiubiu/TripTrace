/**
 * 历史数据索引与建议引擎（纯函数）。
 * 输入 /api/trips 返回的行程数组，产出：
 * - 节点名自动补全（按使用次数与最近使用排序）
 * - 分段里程建议（同方向优先，其次反方向，取最常用值）
 * - 整条路线匹配（节点链完全相同 → 沿用历史分段与总里程）
 * - 最近路线快捷填入
 * - 年度/月度统计与高频路段
 */

const KEY_SEPARATOR = "\u0000";

export function normalizeName(raw) {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

export function legKey(from, to) {
  return `${nameKey(from)}${KEY_SEPARATOR}${nameKey(to)}`;
}

function routeKey(nodes) {
  return nodes.map(nameKey).join(KEY_SEPARATOR);
}

function pickMostUsed(candidates) {
  let best = null;
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

export function buildIndex(trips) {
  const nodes = new Map();
  const legStats = new Map();
  const routeStats = new Map();

  for (const trip of trips) {
    const nodeList = (trip.nodes ?? []).map(normalizeName).filter(Boolean);
    for (const name of nodeList) {
      const key = nameKey(name);
      const entry = nodes.get(key) ?? { name, count: 0, lastDate: "" };
      entry.count += 1;
      if (trip.date > entry.lastDate) entry.lastDate = trip.date;
      if (!entry.name) entry.name = name;
      nodes.set(key, entry);
    }

    for (const leg of trip.legs ?? []) {
      if (leg.km === null || leg.km === undefined) continue;
      const key = legKey(leg.from, leg.to);
      const byKm = legStats.get(key) ?? new Map();
      const stat = byKm.get(leg.km) ?? { km: leg.km, count: 0, lastDate: "" };
      stat.count += 1;
      if (trip.date > stat.lastDate) stat.lastDate = trip.date;
      byKm.set(leg.km, stat);
      legStats.set(key, byKm);
    }

    const key = routeKey(nodeList);
    const existing = routeStats.get(key);
    const candidate = {
      nodes: nodeList,
      totalKm: trip.totalKm,
      legs: (trip.legs ?? []).map((leg) => ({ from: leg.from, to: leg.to, km: leg.km })),
      date: trip.date,
      updatedAt: trip.updatedAt ?? trip.createdAt ?? "",
      count: (existing?.count ?? 0) + 1,
    };
    if (!existing || `${candidate.date}${candidate.updatedAt}` >= `${existing.date}${existing.updatedAt}`) {
      routeStats.set(key, candidate);
    } else {
      routeStats.set(key, { ...existing, count: candidate.count });
    }
  }

  const byRouteKey = new Map();
  for (const [key, value] of routeStats) byRouteKey.set(key, value);

  const legSuggestions = new Map();
  for (const [key, byKm] of legStats) {
    legSuggestions.set(key, pickMostUsed([...byKm.values()]));
  }

  return { nodes, legSuggestions, routes: byRouteKey };
}

export function suggestNodeNames(index, query, exclude = [], limit = 8) {
  const normalizedQuery = nameKey(query);
  const excluded = new Set(exclude.map(nameKey));
  const all = [...index.nodes.values()]
    .filter((entry) => !excluded.has(nameKey(entry.name)))
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1));

  if (!normalizedQuery) return all.slice(0, limit);

  const starts = [];
  const contains = [];
  for (const entry of all) {
    const key = nameKey(entry.name);
    if (key.startsWith(normalizedQuery)) starts.push(entry);
    else if (key.includes(normalizedQuery)) contains.push(entry);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** 分段里程建议：同方向历史优先；没有时退回反方向并标记 reversed。 */
export function suggestLegKm(index, from, to) {
  const forward = index.legSuggestions.get(legKey(from, to));
  if (forward) return { ...forward, reversed: false };

  const backward = index.legSuggestions.get(legKey(to, from));
  if (backward) return { ...backward, reversed: true };

  return null;
}

export function findRoute(index, nodes) {
  if (!nodes || nodes.length < 2) return null;
  return index.routes.get(routeKey(nodes.map(normalizeName))) ?? null;
}

export function recentRoutes(index, trips, limit = 6) {
  const seen = new Set();
  const list = [...trips].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const result = [];
  for (const trip of list) {
    const nodes = (trip.nodes ?? []).map(normalizeName).filter(Boolean);
    if (nodes.length < 2) continue;
    const key = routeKey(nodes);
    if (seen.has(key)) continue;
    seen.add(key);
    const stat = index.routes.get(key);
    result.push({
      nodes,
      totalKm: trip.totalKm,
      legs: trip.legs ?? [],
      date: trip.date,
      count: stat?.count ?? 1,
    });
    if (result.length >= limit) break;
  }
  return result;
}

/** 年度统计：总额、次数、记录天数、月度分布、高频路段。 */
export function computeStats(trips, year) {
  const prefix = `${year}-`;
  const months = Array.from({ length: 12 }, () => ({ km: 0, tripCount: 0, days: new Set() }));
  const legTotals = new Map();
  let totalKm = 0;
  let tripCount = 0;
  let missingKm = 0;
  const days = new Set();

  for (const trip of trips) {
    if (!String(trip.date ?? "").startsWith(prefix)) continue;
    tripCount += 1;
    days.add(trip.date);
    if (trip.totalKm === null || trip.totalKm === undefined) missingKm += 1;
    else totalKm += trip.totalKm;

    const monthIndex = Number.parseInt(String(trip.date).slice(5, 7), 10) - 1;
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

  const topLegs = [...legTotals.values()].sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 5);

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

export function formatKm(value) {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

export function chainText(nodes, separator = " → ") {
  return (nodes ?? []).map(normalizeName).filter(Boolean).join(separator);
}

export function formatDateLabel(date) {
  const parts = String(date).split("-");
  if (parts.length !== 3) return date;
  const [year, month, day] = parts;
  return `${year}年${Number.parseInt(month, 10)}月${Number.parseInt(day, 10)}日`;
}

export function weekdayLabel(date) {
  const time = Date.parse(`${date}T00:00:00`);
  if (Number.isNaN(time)) return "";
  return `星期${"日一二三四五六"[new Date(time).getDay()]}`;
}
