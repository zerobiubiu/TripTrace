/** 与 Worker API 的交互封装：统一错误对象 {code, message, status}。 */

async function request(method, path, body) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `请求失败（HTTP ${response.status}）`);
    error.code = payload?.error?.code ?? `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const api = {
  me: () => request("GET", "/api/me"),
  login: (username, password) => request("POST", "/api/auth/login", { username, password }),
  register: (payload) => request("POST", "/api/auth/register", payload),
  logout: () => request("POST", "/api/auth/logout", {}),
  changePassword: (currentPassword, newPassword) =>
    request("POST", "/api/auth/password", { currentPassword, newPassword }),
  listTrips: () => request("GET", "/api/trips"),
  createTrip: (trip) => request("POST", "/api/trips", trip),
  updateTrip: (id, trip) => request("PUT", `/api/trips/${encodeURIComponent(id)}`, trip),
  deleteTrip: (id) => request("DELETE", `/api/trips/${encodeURIComponent(id)}`),
  bulkImport: (trips) => request("POST", "/api/trips/bulk", { trips }),
};
