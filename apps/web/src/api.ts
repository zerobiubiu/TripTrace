/** 与 Worker API 的交互封装：统一错误对象（message / code / status），并把网络故障与业务错误分开。 */

import type { MeResponse, Trip, TripPayload, User } from "./types";

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
};
