/** 展示与日期格式工具（移动端与桌面端共用）。 */

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function shiftDate(iso: string, days: number): string {
  const time = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(time)) return todayIso();
  const shifted = new Date(time + days * 24 * 60 * 60 * 1000);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}-${pad2(shifted.getDate())}`;
}

export function parseKmInput(text: string): number | null {
  const raw = text.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100000) return null;
  return Math.round(value * 100) / 100;
}

export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function chainText(nodes: string[], separator = " → "): string {
  return nodes.map(normalizeName).filter(Boolean).join(separator);
}

export function formatDateLabel(date: string): string {
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[0]}年${Number.parseInt(parts[1] ?? "0", 10)}月${Number.parseInt(parts[2] ?? "0", 10)}日`;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${year}年${Number.parseInt(month ?? "0", 10)}月`;
}

export function weekdayLabel(date: string): string {
  const time = Date.parse(`${date}T00:00:00`);
  if (Number.isNaN(time)) return "";
  return `星期${"日一二三四五六"[new Date(time).getDay()]}`;
}
