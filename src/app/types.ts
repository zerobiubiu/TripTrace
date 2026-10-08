/** 前后端共用的数据结构（与 Worker 的 API 契约一致）。 */

export interface Leg {
  from: string;
  to: string;
  km: number | null;
}

export interface Trip {
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

export interface TripPayload {
  date: string;
  nodes: string[];
  legs: Array<{ from: string; to: string; km: number | null }>;
  totalKm: number | null;
  note: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
}

export interface MeResponse {
  user: User | null;
  signupCodeRequired: boolean;
  version: string;
}

export interface ImportEntry {
  date: string;
  nodes: string[];
  totalKm: number | null;
  hint: string;
  checked: boolean;
}

export interface ImportParseResult {
  entries: Array<Omit<ImportEntry, "checked">>;
  notes: string[];
}

export type TabKey = "entry" | "records" | "stats" | "import";

export interface ToastMessage {
  id: number;
  text: string;
  kind: "info" | "error";
}
