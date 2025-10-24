import { Router } from "./router.ts";

import gengi from "./endpoints/gengi.ts";

const router = new Router();
router.add("GET", "/x/gengi/{:code}?", gengi);

Deno.serve((...args) => router.route(...args));
