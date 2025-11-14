import { reportError } from "./error-monitor.ts";

type CallbackHandler = {
  (
    request: Request,
    params: Record<string, string>,
  ): Response | Promise<Response>;
  meta?: {
    endpoint: string;
    description: string;
  };
};

export class Router {
  #routes: Record<
    string,
    Array<{ pattern: URLPattern; handler: CallbackHandler }>
  > = {
    "GET": [],
    "POST": [],
    "PUT": [],
  };
  add(method: string, pathname: string, handler: CallbackHandler) {
    this.#routes[method].push({
      pattern: new URLPattern({ pathname }),
      handler,
    });
  }
  async route(req: Request): Promise<Response> {
    const startTime = performance.now();
    const url = new URL(req.url);
    const pathname = url.pathname;

    for (const route of this.#routes[req.method]) {
      if (route.pattern.test(req.url)) {
        const match = route.pattern.exec(req.url);
        if (match) {
          const params = (match.pathname.groups || {}) as Record<
            string,
            string
          >;
          try {
            const response = await route["handler"](req, params);
            const duration = performance.now() - startTime;
            console.log(
              `${
                new Date().toISOString()
              } ${req.method} ${pathname} -> ${response.status} ${
                duration.toFixed(2)
              }ms`,
            );
            return response;
          } catch (error) {
            const duration = performance.now() - startTime;
            console.log(
              `${new Date().toISOString()} ${req.method} ${pathname} -> 500 ${
                duration.toFixed(2)
              }ms`,
            );
            // Report the error to monitoring system
            await reportError(error as Error, req);

            // Return a 500 error response
            return new Response(
              JSON.stringify({ error: "Internal Server Error" }),
              {
                status: 500,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              },
            );
          }
        }
      }
    }
    const duration = performance.now() - startTime;
    console.log(
      `${new Date().toISOString()} ${req.method} ${pathname} -> 404 ${
        duration.toFixed(2)
      }ms`,
    );
    return Promise.resolve(new Response(null, { status: 404 }));
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
}
