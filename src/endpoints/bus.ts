import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { parseCsv } from "../csv.ts";
import { response } from "../utils.ts";
import { readZipFiles } from "../zip.ts";

const GTFS_URL = "https://opendata.straeto.is/data/gtfs/gtfs.zip";
const TTL_SECONDS = 24 * 60 * 60;

const Stop = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

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

function cached(data: unknown[] | Record<string, unknown>, request: Request) {
  const res = response(
    data,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
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
  return cached(stop, request);
}

busStops.meta = {
  endpoint: "/x/bus/stops/{id}",
  description:
    "Strætó bus stops from its published GTFS schedule. Optional {id} returns a single stop.",
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
