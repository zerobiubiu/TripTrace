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
  me: () => request<MeResponse>("GET", "/api/me"),
  login: (username: string, password: string) =>
    request<{ user: User }>("POST", "/api/auth/login", { username, password }),
  register: (payload: { username: string; displayName: string; password: string; signupCode?: string }) =>
    request<{ user: User }>("POST", "/api/auth/register", payload),
  logout: () => request<{ ok: boolean }>("POST", "/api/auth/logout", {}),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("POST", "/api/auth/password", { currentPassword, newPassword }),
  listTrips: () => request<{ trips: Trip[] }>("GET", "/api/trips"),
  createTrip: (trip: TripPayload) => request<{ trip: Trip }>("POST", "/api/trips", trip),
  updateTrip: (id: string, trip: TripPayload) =>
    request<{ trip: Trip }>("PUT", `/api/trips/${encodeURIComponent(id)}`, trip),
  deleteTrip: (id: string) => request<{ ok: boolean }>("DELETE", `/api/trips/${encodeURIComponent(id)}`),
  bulkImport: (trips: TripPayload[]) =>
    request<{ created: number; skipped: number }>("POST", "/api/trips/bulk", { trips }),

  // 账号自助
  updateProfile: (patch: ProfilePatch) => request<{ user: UserDto }>("PATCH", "/api/me", patch),
  uploadAvatar: (dataUrl: string) => request<{ user: UserDto }>("PUT", "/api/me/avatar", { dataUrl }),
  removeAvatar: () => request<{ user: UserDto }>("DELETE", "/api/me/avatar"),
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
