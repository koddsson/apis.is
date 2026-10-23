import type { Router } from "../router.ts";
import { response } from "../utils.ts";

export default function meta(router: Router) {
  return (request: Request, _params: Record<string, string>): Response => {
    const endpoints = router.getEndpoints();
    const url = new URL(request.url);
    return response({ endpoints }, url.searchParams.get("pretty") === "true");
  };
}
