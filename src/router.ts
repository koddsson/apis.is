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
  route(req: Request): Promise<Response> {
    for (const route of this.#routes[req.method]) {
      if (route.pattern.test(req.url)) {
        const match = route.pattern.exec(req.url);
        if (match) {
          const params = (match.pathname.groups || {}) as Record<
            string,
            string
          >;
          return Promise.resolve(route["handler"](req, params));
        }
      }
    }
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
