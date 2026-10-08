/**
 * 极简路由器：按 method + 路径段匹配，支持 `:name` 占位参数。
 */

export interface RouteContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  params: Record<string, string>;
}

export type RouteHandler = (context: RouteContext) => Promise<Response> | Response;

interface CompiledRoute {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

export type RouteMatch = { handler: RouteHandler; params: Record<string, string> } | { methodMismatch: true };

function matchSegments(
  pattern: string[],
  actual: string[],
): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const expected = pattern[i] ?? "";
    const value = actual[i] ?? "";
    if (expected.startsWith(":")) {
      if (!value) return null;
      params[expected.slice(1)] = decodeURIComponent(value);
      continue;
    }
    if (expected !== value) return null;
  }
  return params;
}

export class Router {
  readonly #routes: CompiledRoute[] = [];

  add(method: string, pattern: string, handler: RouteHandler): void {
    this.#routes.push({
      method: method.toUpperCase(),
      segments: pattern.split("/").filter(Boolean),
      handler,
    });
  }

  match(method: string, pathname: string): RouteMatch | null {
    const segments = pathname.split("/").filter(Boolean);
    let pathMatched = false;
    for (const route of this.#routes) {
      const params = matchSegments(route.segments, segments);
      if (!params) continue;
      pathMatched = true;
      if (route.method === method.toUpperCase()) return { handler: route.handler, params };
    }
    return pathMatched ? { methodMismatch: true } : null;
  }
}
