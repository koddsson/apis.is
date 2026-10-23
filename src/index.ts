import car from "./endpoints/car.ts";
import earthquakes from "./endpoints/earthquakes.ts";
import gengi from "./endpoints/gengi.ts";
import meetups from "./endpoints/meetups.ts";
import meta from "./endpoints/meta.ts";
import nova2f1 from "./endpoints/nova-2f1.ts";
import raceCalendar from "./endpoints/race-calendar.ts";
import weather from "./endpoints/weather.ts";
import { reportError } from "./error-monitor.ts";
import { checkEndpoints, reportHealth } from "./health.ts";
import { commonLogMiddleware } from "./middleware.ts";
import { Router } from "./router.ts";

const router = new Router();

// Add middleware
router.use(commonLogMiddleware);

router.add("GET", "/", meta(router));

router.add("GET", "/x/gengi/{:code}?", gengi);
router.add("GET", "/x/meetups", meetups);
router.add("GET", "/x/car/{:number}?", car);
router.add("GET", "/x/race-calendar", raceCalendar);
router.add("GET", "/x/nova-2f1", nova2f1);
router.add("GET", "/x/earthquakes", earthquakes);
router.add("GET", "/x/weather/{:station}?", weather);

// Global unhandled rejection handler
globalThis.addEventListener("unhandledrejection", (event) => {
  const error =
    event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
  reportError(error);
  event.preventDefault();
});

export default {
  fetch: (req: Request) => router.route(req),
  scheduled: (
    _controller: ScheduledController,
    _env: unknown,
    ctx: ExecutionContext,
  ) => {
    ctx.waitUntil(checkEndpoints(router).then(reportHealth));
  },
};
