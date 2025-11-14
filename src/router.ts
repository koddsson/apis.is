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
  #formatLogEntry(
    req: Request,
    status: number,
    responseSize: number,
  ): string {
    // Common Log Format: host - - [date] "method path protocol" status size
    const url = new URL(req.url);
    const date = new Date();
    // Format: [10/Oct/2000:13:55:36 -0700]
    const day = String(date.getDate()).padStart(2, "0");
    const month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const offset = -date.getTimezoneOffset();
    const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(
      2,
      "0",
    );
    const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, "0");
    const offsetSign = offset >= 0 ? "+" : "-";
    const formattedDate =
      `[${day}/${month}/${year}:${hours}:${minutes}:${seconds} ${offsetSign}${offsetHours}${offsetMinutes}]`;

    // Get client IP - for Deno Deploy this would be in headers, fallback to "-"
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") || "-";

    return `${clientIp} - - ${formattedDate} "${req.method} ${url.pathname}${url.search} HTTP/1.1" ${status} ${responseSize}`;
  }

  async route(req: Request): Promise<Response> {
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
            // Calculate response size from body
            const responseClone = response.clone();
            const body = await responseClone.text();
            const responseSize = new TextEncoder().encode(body).length;
            console.log(
              this.#formatLogEntry(req, response.status, responseSize),
            );
            return response;
          } catch (error) {
            const errorResponse = JSON.stringify({
              error: "Internal Server Error",
            });
            const responseSize = new TextEncoder().encode(errorResponse).length;
            console.log(this.#formatLogEntry(req, 500, responseSize));

            // Report the error to monitoring system
            await reportError(error as Error, req);

            // Return a 500 error response
            return new Response(
              errorResponse,
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
    console.log(this.#formatLogEntry(req, 404, 0));
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
