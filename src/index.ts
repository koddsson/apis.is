import airQuality from "./endpoints/air-quality.ts";
import { busRoutes, busStops, busVehicles } from "./endpoints/bus.ts";
import car from "./endpoints/car.ts";
import flights from "./endpoints/flights.ts";
import gengi from "./endpoints/gengi.ts";
import meetups from "./endpoints/meetups.ts";
import meta from "./endpoints/meta.ts";
import nova2f1 from "./endpoints/nova-2f1.ts";
import { births, population } from "./endpoints/population.ts";
import raceCalendar from "./endpoints/race-calendar.ts";
import { roadConditions, roadWeather } from "./endpoints/roads.ts";
import traffic from "./endpoints/traffic.ts";
import weather from "./endpoints/weather.ts";
import { reportError } from "./error-monitor.ts";
import { checkEndpoints, reportHealth } from "./health.ts";
import { Router } from "./router.ts";

const router = new Router();

router.add("GET", "/", meta(router));

router.add("GET", "/x/gengi{/:code}?", gengi);
router.add("GET", "/x/meetups", meetups);
router.add("GET", "/x/car{/:number}?", car);
router.add("GET", "/x/race-calendar", raceCalendar);
router.add("GET", "/x/nova-2f1", nova2f1);
router.add("GET", "/x/weather{/:station}?", weather);
router.add("GET", "/x/bus/stops{/:id}?", busStops);
router.add("GET", "/x/bus/routes", busRoutes);
router.add("GET", "/x/bus/vehicles", busVehicles);
router.add("GET", "/x/flights/{:type}", flights);
router.add("GET", "/x/roads/conditions", roadConditions);
router.add("GET", "/x/roads/weather", roadWeather);
router.add("GET", "/x/traffic", traffic);
router.add("GET", "/x/air-quality", airQuality);
router.add("GET", "/x/population", population);
router.add("GET", "/x/population/births", births);

export function onUnhandledRejection(event: PromiseRejectionEvent) {
  const error =
    event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
  reportError(error);
  event.preventDefault();
}

globalThis.addEventListener("unhandledrejection", onUnhandledRejection);

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
