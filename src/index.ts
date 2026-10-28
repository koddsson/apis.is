import airQuality from "./endpoints/air-quality.ts";
import althingiVotes from "./endpoints/althingi.ts";
import althingiAgenda from "./endpoints/althingi-agenda.ts";
import { althingiBill, althingiBills } from "./endpoints/althingi-bills.ts";
import aurora from "./endpoints/aurora.ts";
import avalanche from "./endpoints/avalanche.ts";
import { busRoutes, busStops, busVehicles } from "./endpoints/bus.ts";
import car from "./endpoints/car.ts";
import flights from "./endpoints/flights.ts";
import foodInspections from "./endpoints/food-inspections.ts";
import gengi from "./endpoints/gengi.ts";
import lightning from "./endpoints/lightning.ts";
import meetups from "./endpoints/meetups.ts";
import meta from "./endpoints/meta.ts";
import nova2f1 from "./endpoints/nova-2f1.ts";
import outages from "./endpoints/outages.ts";
import pools from "./endpoints/pools.ts";
import { births, population } from "./endpoints/population.ts";
import raceCalendar from "./endpoints/race-calendar.ts";
import recalls from "./endpoints/recalls.ts";
import reservoirs from "./endpoints/reservoirs.ts";
import {
  reykjavikTraffic,
  streetClosures,
} from "./endpoints/reykjavik-streets.ts";
import rivers from "./endpoints/rivers.ts";
import roadCameras from "./endpoints/road-cameras.ts";
import roadIncidents from "./endpoints/road-incidents.ts";
import { roadConditions, roadWeather } from "./endpoints/roads.ts";
import seaIce from "./endpoints/sea-ice.ts";
import ships from "./endpoints/ships.ts";
import ski from "./endpoints/ski.ts";
import traffic from "./endpoints/traffic.ts";
import tv from "./endpoints/tv.ts";
import uv from "./endpoints/uv.ts";
import waves from "./endpoints/waves.ts";
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
router.add("GET", "/x/waves", waves);
router.add("GET", "/x/outages", outages);
router.add("GET", "/x/pools", pools);
router.add("GET", "/x/avalanche", avalanche);
router.add("GET", "/x/air-quality", airQuality);
router.add("GET", "/x/population", population);
router.add("GET", "/x/population/births", births);
router.add("GET", "/x/tv", tv);
router.add("GET", "/x/recalls", recalls);
router.add("GET", "/x/uv", uv);
router.add("GET", "/x/reservoirs", reservoirs);
router.add("GET", "/x/rivers", rivers);
router.add("GET", "/x/lightning", lightning);
router.add("GET", "/x/althingi/votes", althingiVotes);
router.add("GET", "/x/althingi/bills", althingiBills);
router.add("GET", "/x/althingi/bills/:number", althingiBill);
router.add("GET", "/x/althingi/agenda", althingiAgenda);
router.add("GET", "/x/aurora", aurora);
router.add("GET", "/x/traffic/reykjavik", reykjavikTraffic);
router.add("GET", "/x/roads/closures", streetClosures);
router.add("GET", "/x/roads/incidents", roadIncidents);
router.add("GET", "/x/roads/cameras", roadCameras);
router.add("GET", "/x/ski", ski);
router.add("GET", "/x/sea-ice", seaIce);
router.add("GET", "/x/food-inspections{/:query}?", foodInspections);
router.add("GET", "/x/ships", ships);

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
