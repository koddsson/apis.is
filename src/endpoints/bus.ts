import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { parseCsv } from "../csv.ts";
import { response } from "../utils.ts";
import { readZipFiles } from "../zip.ts";

const GTFS_URL = "https://opendata.straeto.is/data/gtfs/gtfs.zip";
// Undocumented files behind Strætó's own live map, refreshed every minute.
const LIVE_URL = "https://opendata.straeto.is/data/dyn-data";
const TTL_SECONDS = 24 * 60 * 60;
const LIVE_TTL_SECONDS = 30;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

const Stop = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

const Arrival = z.object({
  route: z.string(),
  destination: z.string(),
  arrival: z.iso.datetime(),
  minutes: z.number(),
  vehicle: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

const StopPlace = z.object({ id: z.string(), name: z.string() });

const Vehicle = z.object({
  route: z.string(),
  vehicle: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  heading: z.number(),
  lastStop: StopPlace.nullable(),
  nextStop: StopPlace.nullable(),
  arrivals: z.array(
    z.object({
      stop: StopPlace,
      destination: z.string(),
      scheduled: z.iso.datetime(),
      predicted: z.iso.datetime(),
    }),
  ),
});

interface UpstreamVehicle {
  vagn: string;
  lat: number;
  lon: number;
  head: number;
  last_stopnum: string | null;
  last_stopname: string | null;
  next_stopnum: string | null;
  next_stopname: string | null;
  komur: Array<{
    stopp: string;
    heiti: string;
    til: string;
    koma: string;
    sched: string;
  }>;
}

interface UpstreamArrival {
  wait: string;
  lat: number | null;
  lon: number | null;
  route: string;
  vehicle: string;
  to: string;
  arrival: string;
}

const Route = z.object({
  id: z.string(),
  number: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});

async function fetchGtfs() {
  const files = await readZipFiles(GTFS_URL, ["stops.txt", "routes.txt"]);
  return {
    stops: parseCsv(files["stops.txt"]).map((stop) => ({
      id: stop.stop_id,
      name: stop.stop_name,
      latitude: Number(stop.stop_lat),
      longitude: Number(stop.stop_lon),
    })),
    routes: parseCsv(files["routes.txt"]).map((route) => ({
      id: route.route_id,
      number: route.route_short_name,
      name: route.route_long_name,
      color: route.route_color ? `#${route.route_color}` : null,
    })),
  };
}

function gtfs() {
  return withCache("bus-gtfs", TTL_SECONDS, fetchGtfs);
}

// Live times are "HH:MM" in Icelandic local time, which is UTC, and `sent`
// ("YYYY-MM-DD HH:MM:SS") dates them. A time more than 12 hours away from
// `sent` belongs to the day before or after.
export function liveTime(time: string, sent: string): string {
  const now = Date.parse(`${sent.replace(" ", "T")}Z`);
  let at = Date.parse(`${sent.slice(0, 10)}T${time}:00Z`);
  if (at < now - HALF_DAY_MS) at += 2 * HALF_DAY_MS;
  else if (at > now + HALF_DAY_MS) at -= 2 * HALF_DAY_MS;
  return new Date(at).toISOString();
}

async function fetchLive<T>(path: string): Promise<T | null> {
  const res = await fetch(`${LIVE_URL}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch live bus data: ${res.status}`);
  return res.json<T>();
}

// Null before a bus reaches the first stop of its trip.
function stopPlace(id: string | null, name: string | null) {
  return id && name ? { id, name } : null;
}

async function fetchVehicles(): Promise<z.infer<typeof Vehicle>[]> {
  const live = await fetchLive<{
    sent: string;
    leidir: Array<{ leid: string; ferlar: UpstreamVehicle[] }>;
  }>("vagnar-all.json");
  if (!live) throw new Error("Live bus positions not found");

  return live.leidir.flatMap(({ leid, ferlar }) =>
    ferlar.map((bus) => ({
      route: leid,
      vehicle: bus.vagn,
      latitude: bus.lat,
      longitude: bus.lon,
      heading: bus.head,
      lastStop: stopPlace(bus.last_stopnum, bus.last_stopname),
      nextStop: stopPlace(bus.next_stopnum, bus.next_stopname),
      arrivals: bus.komur.map((stop) => ({
        stop: { id: stop.stopp, name: stop.heiti },
        destination: stop.til,
        scheduled: liveTime(stop.sched, live.sent),
        predicted: liveTime(stop.koma, live.sent),
      })),
    })),
  );
}

async function fetchArrivals(id: string): Promise<z.infer<typeof Arrival>[]> {
  const live = await fetchLive<{
    sent: string;
    feeds: Array<{ arrivals: UpstreamArrival[] }>;
  }>(`nl/${id}.json`);
  if (!live) return [];

  return (live.feeds[0]?.arrivals ?? []).map((arrival) => ({
    route: arrival.route,
    destination: arrival.to,
    arrival: liveTime(arrival.arrival, live.sent),
    minutes: Number(arrival.wait),
    vehicle: arrival.vehicle || null,
    latitude: arrival.lat,
    longitude: arrival.lon,
  }));
}

function cached(
  data: unknown[] | Record<string, unknown>,
  request: Request,
  ttlSeconds = TTL_SECONDS,
) {
  const res = response(
    data,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(ttlSeconds));
  return res;
}

export async function busStops(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { stops } = await gtfs();
  if (!params.id) return cached(stops, request);

  const stop = stops.find((s) => s.id === params.id);
  if (!stop)
    return response({ error: `Unknown stop ${params.id}` }, false, 404);

  const arrivals = await withCache(
    `bus-arrivals-${stop.id}`,
    LIVE_TTL_SECONDS,
    () => fetchArrivals(stop.id),
  );
  return cached({ ...stop, arrivals }, request, LIVE_TTL_SECONDS);
}

busStops.meta = {
  endpoint: "/x/bus/stops/{id}",
  description:
    "Strætó bus stops from its published GTFS schedule. Optional {id} returns a single stop with its next live arrivals.",
};

busStops.health = { schema: z.array(Stop).min(1) };

export async function busRoutes(request: Request): Promise<Response> {
  const { routes } = await gtfs();
  return cached(routes, request);
}

busRoutes.meta = {
  endpoint: "/x/bus/routes",
  description: "Strætó bus routes from its published GTFS schedule.",
};

busRoutes.health = { schema: z.array(Route).min(1) };

export async function busVehicles(request: Request): Promise<Response> {
  const vehicles = await withCache(
    "bus-vehicles",
    LIVE_TTL_SECONDS,
    fetchVehicles,
  );
  const route = new URL(request.url).searchParams.get("route");
  return cached(
    route ? vehicles.filter((bus) => bus.route === route) : vehicles,
    request,
    LIVE_TTL_SECONDS,
  );
}

busVehicles.meta = {
  endpoint: "/x/bus/vehicles",
  description:
    "Live positions of Strætó buses with their next stops and predicted arrival times, updated every minute. Optional ?route= filter.",
};

// Empty at night, when no buses are running.
busVehicles.health = { schema: z.array(Vehicle) };
