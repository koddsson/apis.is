import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// Documented at https://api.ust.is/aq
const LATEST_URL = "https://api.ust.is/aq/a/getLatest";
const STATIONS_URL = "https://api.ust.is/aq/a/getStations";
const TTL_SECONDS = 15 * 60;
const STATIONS_TTL_SECONDS = 24 * 60 * 60;

interface UpstreamReading {
  endtime: string;
  value: string;
  verification: number;
}

type UpstreamParameter = { unit: string } & Record<
  string,
  UpstreamReading | string
>;

interface UpstreamLatest {
  name: string;
  local_id: string;
  parameters: Record<string, UpstreamParameter>;
}

interface UpstreamStation {
  local_id: string;
  municipality: string | null;
  latitude: string;
  longitude: string;
}

const Reading = z.object({
  value: z.number(),
  unit: z.string(),
  time: z.iso.datetime(),
  verified: z.boolean(),
});
type Reading = z.infer<typeof Reading>;

const Station = z.object({
  id: z.string(),
  name: z.string(),
  municipality: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  readings: z.record(z.string(), Reading),
});

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch air quality: ${res.status}`);
  return res.json<T>();
}

function latestReading(parameter: UpstreamParameter): Reading | null {
  const newest = parameter["0"];
  if (typeof newest !== "object") return null;
  return {
    value: Number(newest.value),
    unit: parameter.unit,
    // UST times are Icelandic local time, which is UTC.
    time: `${newest.endtime.replace(" ", "T")}Z`,
    verified: newest.verification === 1,
  };
}

async function fetchAirQuality() {
  const [latest, stations] = await Promise.all([
    fetchJson<Record<string, UpstreamLatest>>(LATEST_URL),
    withCache("air-quality-stations", STATIONS_TTL_SECONDS, () =>
      fetchJson<UpstreamStation[]>(STATIONS_URL),
    ),
  ]);
  const stationsById = new Map(stations.map((s) => [s.local_id, s]));

  return Object.values(latest).map((station) => {
    const info = stationsById.get(station.local_id);
    const readings: Record<string, Reading> = {};
    for (const [name, parameter] of Object.entries(station.parameters)) {
      const reading = latestReading(parameter);
      if (reading) readings[name] = reading;
    }
    return {
      id: station.local_id,
      name: station.name,
      municipality: info?.municipality ?? null,
      latitude: info ? Number(info.latitude) : null,
      longitude: info ? Number(info.longitude) : null,
      readings,
    };
  });
}

async function airQuality(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const stations = await withCache("air-quality", TTL_SECONDS, fetchAirQuality);

  const id = url.searchParams.get("station");
  const data = id
    ? stations.filter(
        (station) => station.id.toUpperCase() === id.toUpperCase(),
      )
    : stations;
  if (id && data.length === 0) {
    return response({ error: `Unknown station ${id}` }, false, 404);
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

airQuality.meta = {
  endpoint: "/x/air-quality",
  description:
    "Latest hourly air quality readings (PM10, PM2.5, NO2, SO2, H2S, …) per measurement station from Umhverfis- og orkustofnun. Optional ?station= id filter.",
};

airQuality.health = { schema: z.array(Station).min(1) };

export default airQuality;
