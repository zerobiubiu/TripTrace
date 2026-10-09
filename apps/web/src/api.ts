/** 与 Worker API 的交互封装：统一错误对象（message / code / status），并把网络故障与业务错误分开。 */

import type { MeResponse, Trip, TripPayload, User } from "./types";
// 管理端/账号自助的契约类型 types.ts 尚未转出，直接从契约包引入
import type {
  AdminUserListResponse,
  OkResponse,
  ProfilePatch,
  SessionListResponse,
  UserDto,
} from "@triptrace/contracts";

export interface ApiError extends Error {
  code?: string;
  status?: number;
}

/** 网络层失败（断网、DNS、连接被中断）对用户的说法，不再暴露 `Failed to fetch`。 */
const NETWORK_MESSAGE = "网络不可用，请检查连接后重试";

/**
 * 服务端理应只回契约里的形状，但客户端不能假设它一定成立：一条畸形记录会让渲染期抛错，
 * 进而整棵组件树卸载（白屏）。所以在边界处把返回值「洗」成合法形状——最坏只是少一条记录。
 */
function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeTrip(raw: unknown): Trip | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = asString(value.id);
  const date = asString(value.date);
  if (!id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const nodes = Array.isArray(value.nodes)
    ? value.nodes.map((node) => asString(node) ?? "").filter((node) => node.trim() !== "")
    : [];
  if (nodes.length === 0) return null;
  const legs = Array.isArray(value.legs)
    ? value.legs.flatMap((leg) => {
        if (!leg || typeof leg !== "object") return [];
        const item = leg as Record<string, unknown>;
        return [{ from: asString(item.from) ?? "", to: asString(item.to) ?? "", km: asFiniteNumber(item.km) }];
      })
    : [];
  return {
    id,
    date,
    nodes,
    legs,
    totalKm: asFiniteNumber(value.totalKm),
    note: asString(value.note),
    source: asString(value.source) ?? "manual",
    createdAt: asString(value.createdAt) ?? "",
    updatedAt: asString(value.updatedAt) ?? "",
  };
}

function sanitizeTrips(raw: unknown): Trip[] {
  const list = (raw as { trips?: unknown } | null)?.trips;
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeTrip).filter((trip): trip is Trip => trip !== null);
}

/** 单条行程的响应：洗不出来就当成失败（宁可让表单留着，也不要塞一条坏记录进列表）。 */
function requireTrip(raw: unknown): { trip: Trip } {
  const trip = sanitizeTrip((raw as { trip?: unknown } | null)?.trip);
  if (!trip) {
    const error = new Error("服务端返回的记录无法识别，请刷新后重试") as ApiError;
    error.code = "invalid_payload";
    throw error;
  }
  return { trip };
}

function sanitizeMe(raw: unknown): MeResponse {
  const value = (raw ?? {}) as Record<string, unknown>;
  const candidate = value.user && typeof value.user === "object" ? (value.user as Record<string, unknown>) : null;
  const id = candidate ? asString(candidate.id) : null;
  const username = candidate ? asString(candidate.username) : null;
  return {
    user: candidate && id && username ? { id, username, displayName: asString(candidate.displayName) ?? username } : null,
    signupCodeRequired: value.signupCodeRequired === true,
    version: asString(value.version) ?? "",
    isAdmin: value.isAdmin === true,
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const error = new Error(NETWORK_MESSAGE) as ApiError;
    error.code = "network_error";
    throw error;
  }

  let text = "";
  try {
    text = await response.text();
  } catch {
    const error = new Error(NETWORK_MESSAGE) as ApiError;
    error.code = "network_error";
    throw error;
  }

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as { error?: { code?: string; message?: string } } | null;
    const error: ApiError = new Error(errorPayload?.error?.message ?? `请求失败（HTTP ${response.status}）`);
    error.code = errorPayload?.error?.code ?? `http_${response.status}`;
    error.status = response.status;
    throw error;
  }

  return payload as T;
}

/** 只有 401 才代表会话失效；网络故障与其它错误都不能把用户当成「被登出」。 */
export function isUnauthorized(error: unknown): boolean {
  return (error as ApiError | null)?.status === 401;
}

export function isNetworkFailure(error: unknown): boolean {
  return (error as ApiError | null)?.code === "network_error";
}

export const api = {
  me: () => request<MeResponse>("GET", "/api/me").then(sanitizeMe),
  login: (username: string, password: string) =>
    request<{ user: User }>("POST", "/api/auth/login", { username, password }),
  register: (payload: { username: string; displayName: string; password: string; signupCode?: string }) =>
    request<{ user: User }>("POST", "/api/auth/register", payload),
  logout: () => request<{ ok: boolean }>("POST", "/api/auth/logout", {}),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("POST", "/api/auth/password", { currentPassword, newPassword }),
  listTrips: () =>
    request<{ trips: Trip[] }>("GET", "/api/trips").then((response) => ({ trips: sanitizeTrips(response) })),
  createTrip: (trip: TripPayload) => request<{ trip: Trip }>("POST", "/api/trips", trip).then(requireTrip),
  updateTrip: (id: string, trip: TripPayload) =>
    request<{ trip: Trip }>("PUT", `/api/trips/${encodeURIComponent(id)}`, trip).then(requireTrip),
  deleteTrip: (id: string) => request<{ ok: boolean }>("DELETE", `/api/trips/${encodeURIComponent(id)}`),
  bulkImport: (trips: TripPayload[]) =>
    request<{ created: number; skipped: number }>("POST", "/api/trips/bulk", { trips }),

  // 账号自助
  updateProfile: (patch: ProfilePatch) => request<{ user: UserDto }>("PATCH", "/api/me", patch),
  listSessions: () => request<SessionListResponse>("GET", "/api/me/sessions"),
  revokeSession: (id: string) => request<OkResponse>("DELETE", `/api/me/sessions/${encodeURIComponent(id)}`),

  // 用户管理（仅管理员）
  adminListUsers: () => request<AdminUserListResponse>("GET", "/api/admin/users"),
  adminSetDisabled: (id: string, disabled: boolean) =>
    request<OkResponse>("PATCH", `/api/admin/users/${encodeURIComponent(id)}`, { disabled }),
  adminSetPassword: (id: string, password: string) =>
    request<OkResponse>("POST", `/api/admin/users/${encodeURIComponent(id)}/password`, { password }),
  adminDeleteUser: (id: string) => request<OkResponse>("DELETE", `/api/admin/users/${encodeURIComponent(id)}`),
};
