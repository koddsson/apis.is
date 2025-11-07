import { Router } from "./router.ts";

import meta from "./endpoints/meta.ts";
import gengi from "./endpoints/gengi.ts";
import meetups from "./endpoints/meetups.ts";
import car from "./endpoints/car.ts";

const router = new Router();
router.add("GET", "/x/gengi/{:code}?", gengi);
router.add("GET", "/x/meetups", meetups);
router.add("GET", "/x/car/{:number}?", car);
router.add("GET", "/", meta(router));

Deno.serve((...args) => router.route(...args));
