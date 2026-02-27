import { Router } from "./router.ts";
import { reportError } from "./error-monitor.ts";
import { commonLogMiddleware } from "./middleware.ts";

import meta from "./endpoints/meta.ts";
import gengi from "./endpoints/gengi.ts";
import meetups from "./endpoints/meetups.ts";
import car from "./endpoints/car.ts";
import raceCalendar from "./endpoints/race-calendar.ts";
import nova2f1 from "./endpoints/nova-2f1.ts";

const router = new Router();

// Add middleware
router.use(commonLogMiddleware);

router.add("GET", "/", meta(router));

router.add("GET", "/x/gengi/{:code}?", gengi);
router.add("GET", "/x/meetups", meetups);
router.add("GET", "/x/car/{:number}?", car);
router.add("GET", "/x/race-calendar", raceCalendar);
router.add("GET", "/x/nova-2f1", nova2f1);

// Global error handler to catch all uncaught errors
globalThis.addEventListener("error", (event) => {
  reportError(event.error);
  event.preventDefault(); // Prevent default error handling
});

// Global unhandled rejection handler
globalThis.addEventListener("unhandledrejection", (event) => {
  const error = event.reason instanceof Error
    ? event.reason
    : new Error(String(event.reason));
  reportError(error);
  event.preventDefault();
});

Deno.serve((req) => router.route(req));
