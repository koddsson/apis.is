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

export type Middleware = (
  req: Request,
  next: () => Promise<Response>,
) => Promise<Response>;

export class Router {
  #routes: Record<
    string,
    Array<{ pattern: URLPattern; handler: CallbackHandler }>
  > = {
    "GET": [],
    "POST": [],
    "PUT": [],
  };
  #middleware: Middleware[] = [];

  use(middleware: Middleware) {
    this.#middleware.push(middleware);
  }

  add(method: string, pathname: string, handler: CallbackHandler) {
    this.#routes[method].push({
      pattern: new URLPattern({ pathname }),
      handler,
    });
  }

  async route(req: Request): Promise<Response> {
    // Find matching route
    for (const route of this.#routes[req.method]) {
      if (route.pattern.test(req.url)) {
        const match = route.pattern.exec(req.url);
        if (match) {
          const params = (match.pathname.groups || {}) as Record<
            string,
            string
          >;

          // Create the handler function that will be called at the end of middleware chain
          const handler = async () => {
            try {
              return await route["handler"](req, params);
            } catch (error) {
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
          };

          // Execute middleware chain
          return await this.#executeMiddleware(req, handler);
        }
      }
    }

    // No route matched, return 404
    const notFoundHandler = () =>
      Promise.resolve(new Response(null, { status: 404 }));
    return await this.#executeMiddleware(req, notFoundHandler);
  }

  async #executeMiddleware(
    req: Request,
    handler: () => Promise<Response>,
  ): Promise<Response> {
    let index = 0;

    const next = async (): Promise<Response> => {
      if (index < this.#middleware.length) {
        const middleware = this.#middleware[index++];
        return await middleware(req, next);
      }
      return await handler();
    };

    return await next();
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
