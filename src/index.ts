import { Router } from "./router.ts";

import gengi from "./endpoints/gengi.ts";
import meetups from "./endpoints/meetups.ts";
import car from "./endpoints/car.ts";
import meta from "./endpoints/meta.ts";

const router = new Router();
router.add("GET", "/", meta);
router.add("GET", "/x/gengi/{:code}?", gengi);
router.add("GET", "/x/meetups", meetups);
router.add("GET", "/x/car/{:number}?", car);

Deno.serve((...args) => router.route(...args));
