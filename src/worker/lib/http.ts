/**
 * HTTP 基础设施（与框架无关）：错误类型、Cookie、同源校验、请求体解析、安全响应头。
 * 框架相关的中间件见 `context.ts`。
 */

/** 本项目用到的 HTTP 状态码（收窄类型，便于直接传给 Hono 的 c.json）。 */
export type HttpStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 429 | 500;

export class HttpError extends Error {
  readonly status: HttpStatus;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const SESSION_COOKIE = "tt_session";
/** 400 天：Chrome 等浏览器对 Cookie 生命期的上限；配合滚动续期可长期不失效。 */
export const SESSION_MAX_AGE_SEC = 400 * 24 * 60 * 60;

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

/**
 * 写操作的 CSRF 防护：SameSite=Lax 之外的第二道闸。
 * 浏览器请求带 Sec-Fetch-Site / Origin 时严格校验；非浏览器客户端（无 Origin）放行。
 */
export function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "cross_site_rejected", "拒绝跨站请求");
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "bad_origin", "Origin 头无效");
  }
  if (originHost !== new URL(request.url).host) {
    throw new HttpError(403, "bad_origin", "请求来源与站点不一致");
  }
}

export async function readJsonBody<T>(request: Request, maxBytes = 512 * 1024): Promise<T> {
  const declared = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "body_too_large", "请求体过大");
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new HttpError(413, "body_too_large", "请求体过大");
  }
  if (!text.trim()) {
    throw new HttpError(400, "empty_body", "请求体为空");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "bad_json", "请求体不是合法 JSON");
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
}

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "strict-transport-security": "max-age=15552000",
};

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
