import type { ZodType } from "zod";
import { reportError } from "./error-monitor.ts";
import { response } from "./utils.ts";

export type HealthCheck = {
  params?: Record<string, string>;
  // The shape of a healthy response to the request made with `params`.
  schema: ZodType;
};

export type CallbackHandler = {
  (
    request: Request,
    params: Record<string, string>,
  ): Response | Promise<Response>;
  meta?: {
    endpoint: string;
    description: string;
  };
  health?: HealthCheck;
};

export class Router {
  #routes: Record<
    string,
    Array<{ pattern: URLPattern; handler: CallbackHandler }>
  > = {
    GET: [],
    POST: [],
    PUT: [],
  };
  add(method: string, pathname: string, handler: CallbackHandler) {
    this.#routes[method].push({
      pattern: new URLPattern({ pathname }),
      handler,
    });
  }

  async route(req: Request): Promise<Response> {
    // Find matching route
    const { pathname } = new URL(req.url);
    // "/x/gengi/" and "/x/gengi" are the same route.
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    for (const route of this.#routes[req.method]) {
      const match = route.pattern.exec({ pathname: path });
      if (match) {
        const params = (match.pathname.groups || {}) as Record<string, string>;

        try {
          return await route.handler(req, params);
        } catch (error) {
          await reportError(error as Error, req);
          return response({ error: "Internal Server Error" }, false, 500);
        }
      }
    }

    return new Response(null, { status: 404 });
  }

  getEndpoints() {
    const endpoints: Array<{ endpoint: string; description: string }> = [];
    for (const method in this.#routes) {
      for (const route of this.#routes[method]) {
        if (route.handler.meta) {
          endpoints.push(route.handler.meta);
        }
      }
    }
    return endpoints;
  }

  getHealthChecks() {
    const checks: Array<{
      endpoint: string;
      handler: CallbackHandler;
      health: HealthCheck;
    }> = [];
    for (const method in this.#routes) {
      for (const { handler } of this.#routes[method]) {
        if (handler.meta && handler.health) {
          checks.push({
            endpoint: handler.meta.endpoint,
            handler,
            health: handler.health,
          });
        }
      }
    }
    return checks;
  }
}
