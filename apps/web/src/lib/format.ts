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

/**
 * 把「留空」与「非法」分开：
 * 留空 = value null / invalid false（表示暂不填）；非法 = invalid true（要就地报错，不能静默丢弃）。
 */
export function kmState(text: string): { value: number | null; invalid: boolean } {
  // 界面上的读数现在带千位分隔（12,345.5），用户可能直接复制回来：逗号与空白都容忍
  const raw = text.trim().replace(/[,\uFF0C\s]/g, "");
  if (!raw) return { value: null, invalid: false };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100000) return { value: null, invalid: true };
  return { value: Math.round(value * 100) / 100, invalid: false };
}

/** 给用户看的里程文案：空值说「未填里程」，不要说成「— 公里」。 */
export function formatKmText(value: number | null | undefined): string {
  if (value === null || value === undefined) return "未填里程";
  return `${formatKm(value)} 公里`;
}

/** 千位分隔 + 最多两位小数（尾随零自动去掉）：里程读数是给人扫的，五位数不分隔容易读错。 */
const kmFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return kmFormatter.format(value);
}

export function normalizeName(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

export function chainText(nodes: string[], separator = " → "): string {
  return nodes.map(normalizeName).filter(Boolean).join(separator);
}

export function formatDateLabel(date: string | null | undefined): string {
  if (typeof date !== "string") return "";
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

/** 服务端 ISO 时间戳 → 本地时区的「YYYY年M月D日 HH:mm」；缺失或无法解析时返回 fallback。 */
export function formatDateTimeLabel(iso: string | null | undefined, fallback = "无记录"): string {
  if (!iso) return fallback;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return fallback;
  const date = new Date(time);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 把 User-Agent 归纳成「浏览器 · 系统」的短标签；认不出来时截断原文，避免整行被挤爆。 */
export function userAgentLabel(userAgent: string): string {
  const text = (userAgent ?? "").trim();
  if (!text) return "未知设备";

  // 顺序即优先级：Edge / Opera 的 UA 里也带 Chrome，iOS 上的 Chrome 是 CriOS
  let browser = "";
  if (/Edg\//.test(text)) browser = "Edge";
  else if (/OPR\//.test(text)) browser = "Opera";
  else if (/Firefox\//.test(text)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(text)) browser = "Chrome";
  else if (/Safari\//.test(text)) browser = "Safari";

  let system = "";
  if (/Windows/.test(text)) system = "Windows";
  else if (/iPhone|iPad|iPod/.test(text)) system = "iOS";
  else if (/Android/.test(text)) system = "Android";
  else if (/Mac OS X|Macintosh/.test(text)) system = "macOS";
  else if (/Linux/.test(text)) system = "Linux";

  const label = [browser, system].filter(Boolean).join(" · ");
  return label || (text.length > 32 ? `${text.slice(0, 32)}…` : text);
}
