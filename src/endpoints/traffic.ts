import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// Vegagerðin's traffic counters, as a WFS layer reprojected to WGS84.
// https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/umferdateljarar
const SOURCE_URL =
  "https://gagnaveita.vegagerdin.is/geoserver/gis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gis:umferdvika_2021_1&outputFormat=application/json&srsName=EPSG:4326";
const TTL_SECONDS = 5 * 60;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const Direction = z.object({
  direction: z.string(),
  last15Minutes: z.number().nullable(),
  averageSpeed: z.number().nullable(),
  today: z.number().nullable(),
  days: z.array(z.object({ date: z.iso.date(), count: z.number().nullable() })),
});

const Station = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  updated: z.iso.datetime(),
  directions: z.array(Direction),
});
type Station = z.infer<typeof Station>;

type UpstreamCounter = {
  IDSTOD: number;
  NAFN: string;
  STEFNA: string;
  UMF_15MIN: number | null;
  MEDALHRADI_15MIN: number | null;
  UMF_I_DAG: number | null;
  DAGS_SIDUSTUGAGNA: string;
} & Record<`UMF_DAGUR${(typeof DAYS)[number]}`, number | null> &
  Record<`DAGS_DAGUR${(typeof DAYS)[number]}`, string | null>;

interface UpstreamFeature {
  geometry: { coordinates: [number, number] };
  properties: UpstreamCounter;
}

async function fetchStations(): Promise<Station[]> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch traffic counts: ${res.status}`);
  const { features } = await res.json<{ features: UpstreamFeature[] }>();

  // A station has one feature per direction it counts.
  const stations = new Map<number, Station>();
  for (const { geometry, properties: counter } of features) {
    let station = stations.get(counter.IDSTOD);
    if (!station) {
      const [longitude, latitude] = geometry.coordinates;
      station = {
        id: counter.IDSTOD,
        name: counter.NAFN,
        latitude,
        longitude,
        updated: counter.DAGS_SIDUSTUGAGNA,
        directions: [],
      };
      stations.set(counter.IDSTOD, station);
    }
    station.directions.push({
      direction: counter.STEFNA,
      last15Minutes: counter.UMF_15MIN,
      averageSpeed: counter.MEDALHRADI_15MIN,
      today: counter.UMF_I_DAG,
      days: DAYS.flatMap((day) => {
        const date = counter[`DAGS_DAGUR${day}`];
        return date
          ? [{ date: date.slice(0, 10), count: counter[`UMF_DAGUR${day}`] }]
          : [];
      }),
    });
  }
  return [...stations.values()];
}

async function traffic(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const stations = await withCache("traffic", TTL_SECONDS, fetchStations);

  const id = url.searchParams.get("station");
  const data = id
    ? stations.filter((station) => String(station.id) === id)
    : stations;
  if (id && data.length === 0) {
    return response({ error: `Unknown station ${id}` }, false, 404);
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

traffic.meta = {
  endpoint: "/x/traffic",
  description:
    "Traffic counts from Vegagerðin's road counting stations: vehicles in the last 15 minutes, average speed where measured, today so far, and the past 7 days, per direction. Optional ?station= id filter.",
};

traffic.health = { schema: z.array(Station).min(1) };

export default traffic;
