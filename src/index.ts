import { Router } from "./router.ts";

import meta from "./endpoints/meta.ts";
import gengi from "./endpoints/gengi.ts";
import meetups from "./endpoints/meetups.ts";
import car from "./endpoints/car.ts";
import raceCalendar from "./endpoints/race-calendar.ts";

const router = new Router();
router.add("GET", "/", meta(router));

router.add("GET", "/x/gengi/{:code}?", gengi);
router.add("GET", "/x/meetups", meetups);
router.add("GET", "/x/car/{:number}?", car);
router.add("GET", "/x/race-calendar", raceCalendar);

Deno.serve((req) => router.route(req));
