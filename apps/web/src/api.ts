/** 与 Worker API 的交互封装：统一错误对象（message / code / status）。 */

import type { MeResponse, Trip, TripPayload, User } from "./types";

export interface ApiError extends Error {
  code?: string;
  status?: number;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
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
