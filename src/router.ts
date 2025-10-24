type CallbackHandler = (
  request: Request,
  params: Record<string, string>,
) => Promise<Response>;

export class Router {
  #routes: Record<string, Array<{ pattern: URLPattern; handler: CallbackHandler }>> = {
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
        const params = route.pattern.exec(req.url).pathname.groups;
        return route["handler"](req, params);
      }
    }
    return new Response(null, { status: 404 });
  }
}
