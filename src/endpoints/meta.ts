import { explorer } from "../explorer.ts";
import { pathFor } from "../health.ts";
import type { Router } from "../router.ts";
import { response } from "../utils.ts";

// No Cache-Control here, so the router marks both variants `no-store`:
// Cloudflare's edge cache ignores `Vary: Accept`, so a cached copy of one
// would be served to clients asking for the other.
function wantsHtml(request: Request): boolean {
  return request.headers.get("Accept")?.includes("text/html") ?? false;
}

export default function meta(router: Router) {
  return (request: Request, _params: Record<string, string>): Response => {
    const endpoints = router.getEndpoints();

    if (wantsHtml(request)) {
      const params = new Map(
        router
          .getHealthChecks()
          .map(({ endpoint, health }) => [endpoint, health.params ?? {}]),
      );
      return explorer(
        endpoints.map((meta) => ({
          ...meta,
          example: pathFor(meta.endpoint, params.get(meta.endpoint) ?? {}),
        })),
      );
    }

    const url = new URL(request.url);
    const res = response(
      { endpoints },
      url.searchParams.get("pretty") === "true",
    );
    res.headers.set("Vary", "Accept");
    return res;
  };
}
