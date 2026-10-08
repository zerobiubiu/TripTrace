/**
 * 历史文本解析器：把“日期 + 节点链 + 里程”的文本记录解析成可导入的行程数组。
 *
 * 支持的行格式（与手写记录习惯兼容）：
 *   9.28                                    ← 仅日期（后续只有节点链的行会挂到这一天）
 *   家，依剑，爱克森，圣祥小镇，圣润 57 公里     ← 日期行 + 节点链 + 总里程
 *   家，圣润，家                              ← 只有节点链（挂到当前日期）
 *   10.6 家，圣润，家                         ← 日期与节点链同一行
 *   7.1-7.2 / 8.27-29                        ← 日期区间（展开为多天）
 *   单次25km                                 ← 模板：之后只有日期的行沿用“上一行节点 + 25 公里”
 *   203 公里                                 ← 小计行，忽略
 *   ------                                   ← 分隔线：清空模板
 */

const DATE_LINE =
  /^(\d{1,2})\s*[.\-/月]\s*(\d{1,2})\s*日?(?:\s*[-–~至]\s*(\d{1,2})\s*[.\-/月]?\s*(\d{1,2})?\s*日?)?\s*(.*)$/;
const TEMPLATE_LINE = /^(?:单次|每次|一趟)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:公里|km|千米)?\s*$/i;
const SUBTOTAL_LINE = /^\d+(?:\.\d+)?\s*(?:公里|km|千米)\s*$/i;
const SEPARATOR_LINE = /^[-–—_=*·\s]{2,}$/;
const TRAILING_KM = /^(.*?)[\s　]*(\d+(?:\.\d+)?)\s*(?:公里|km|千米)\s*$/i;
const NODE_SPLIT = /[，,、>·]|->|→|\s{2,}/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isoDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function splitNodes(text) {
  return String(text)
    .split(NODE_SPLIT)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** 展开日期区间（含跨月日期写法，如 8.27-29 与 10.30-2）。 */
function expandDates(monthA, dayA, monthB, dayB, year) {
  const startIso = isoDate(year, monthA, dayA);
  const endIso = isoDate(year, monthB, dayB);
  if (!startIso || !endIso) return [];

  const startTime = Date.parse(`${startIso}T00:00:00Z`);
  const endTime = Date.parse(`${endIso}T00:00:00Z`);
  if (endTime < startTime) return [startIso];

  const dates = [];
  for (let time = startTime; time <= endTime && dates.length < 60; time += 24 * 60 * 60 * 1000) {
    const date = new Date(time);
    dates.push(`${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`);
  }
  return dates;
}

function parseTail(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return { nodes: [], km: null };
  const match = TRAILING_KM.exec(trimmed);
  if (match) {
    return { nodes: splitNodes(match[1] ?? ""), km: Number.parseFloat(match[2] ?? "") };
  }
  return { nodes: splitNodes(trimmed), km: null };
}

/**
 * @param {string} text 原始文本
 * @param {number} year 记录未写年份时使用的年份
 * @returns {{ entries: Array<{date: string, nodes: string[], totalKm: number|null, hint: string}>, notes: string[] }}
 */
export function parseRecords(text, year) {
  const entries = [];
  const notes = [];
  const bareDates = new Set();
  let currentDate = null;
  let template = null;
  let pendingNodes = null;

  const lines = String(text ?? "").split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    if (SEPARATOR_LINE.test(line) && !/\d/.test(line)) {
      template = null;
      return;
    }

    const templateMatch = TEMPLATE_LINE.exec(line);
    if (templateMatch) {
      const km = Number.parseFloat(templateMatch[1] ?? "");
      if (Number.isFinite(km)) template = { nodes: pendingNodes ?? template?.nodes ?? [], km };
      return;
    }

    if (SUBTOTAL_LINE.test(line) && !DATE_LINE.test(line)) {
      notes.push(`第 ${index + 1} 行「${line}」视为小计，已忽略`);
      return;
    }

    const dateMatch = DATE_LINE.exec(line);
    if (dateMatch) {
      const monthA = Number.parseInt(dateMatch[1] ?? "", 10);
      const dayA = Number.parseInt(dateMatch[2] ?? "", 10);
      const tailA = dateMatch[3];
      const tailB = dateMatch[4];
      let endMonth = monthA;
      let endDay = dayA;
      if (tailA && tailB) {
        endMonth = Number.parseInt(tailA, 10);
        endDay = Number.parseInt(tailB, 10);
      } else if (tailA) {
        endMonth = monthA;
        endDay = Number.parseInt(tailA, 10);
        if (endDay < dayA) endMonth += 1; // 8.27-29 这类同月区间；月末跨月时向后顺延
      }
      const dates = expandDates(monthA, dayA, endMonth, endDay, year);
      const rest = (dateMatch[5] ?? "").trim();

      if (dates.length === 0) {
        notes.push(`第 ${index + 1} 行「${line}」日期无法识别，已忽略`);
        return;
      }
      const lastDate = dates[dates.length - 1] ?? null;
      const rangeHint = dates.length > 1 ? "日期区间展开" : "";

      if (rest) {
        const { nodes, km } = parseTail(rest);
        if (nodes.length === 0) {
          currentDate = lastDate;
          if (lastDate) bareDates.add(lastDate);
          return;
        }
        for (const date of dates) {
          entries.push({ date, nodes, totalKm: km, hint: rangeHint });
          bareDates.delete(date);
        }
        currentDate = lastDate;
        pendingNodes = nodes;
        return;
      }

      if (template && template.nodes.length > 0) {
        for (const date of dates) {
          entries.push({
            date,
            nodes: [...template.nodes],
            totalKm: template.km,
            hint: `沿用模板 ${template.nodes.join(" → ")} ${template.km} 公里${rangeHint ? ` · ${rangeHint}` : ""}`,
          });
          bareDates.delete(date);
        }
        currentDate = lastDate;
        return;
      }

      currentDate = lastDate;
      if (lastDate) bareDates.add(lastDate);
      return;
    }

    const { nodes, km } = parseTail(line);
    if (nodes.length === 0) {
      notes.push(`第 ${index + 1} 行「${line}」无法解析，已忽略`);
      return;
    }

    if (currentDate) {
      entries.push({ date: currentDate, nodes, totalKm: km, hint: "" });
      bareDates.delete(currentDate);
    } else {
      pendingNodes = nodes;
    }
  });

  for (const date of bareDates) {
    notes.push(`${date} 只有日期、没有记录，已跳过`);
  }

  const seen = new Set();
  const unique = [];
  for (const entry of entries) {
    const key = `${entry.date}|${entry.nodes.join("|")}|${entry.totalKm ?? ""}`;
    if (seen.has(key)) {
      notes.push(`重复记录已跳过：${entry.date} ${entry.nodes.join(" → ")}`);
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }

  return { entries: unique, notes };
}
