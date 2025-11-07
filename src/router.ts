type CallbackHandler = (
  request: Request,
  params: Record<string, string>,
) => Promise<Response>;

interface EndpointMeta {
  endpoint: string;
  description: string;
}

type HandlerWithMeta = CallbackHandler & { meta?: EndpointMeta };

export class Router {
  #routes: Record<string, Array<{ pattern: URLPattern; handler: HandlerWithMeta }>> = {
    "GET": [],
    "POST": [],
    "PUT": [],
  };
  add(method: string, pathname: string, handler: HandlerWithMeta) {
    this.#routes[method].push({
      pattern: new URLPattern({ pathname }),
      handler,
    });
  }
  route(req: Request): Promise<Response> {
    for (const route of this.#routes[req.method]) {
      if (route.pattern.test(req.url)) {
        const params = route.pattern.exec(req.url).pathname.groups;
        return route["handler"](req, params);
      }
    }
    return new Response(null, { status: 404 });
  }
  getEndpoints(): EndpointMeta[] {
    const endpoints: EndpointMeta[] = [];
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
