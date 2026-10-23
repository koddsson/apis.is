import { XMLParser } from "fast-xml-parser";
import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const STATIONS_URL = "https://api.vedur.is/weather/stations";
const XML_URL = "https://xmlweather.vedur.is/";
const STATIONS_TTL_SECONDS = 24 * 60 * 60;
const TTL_SECONDS = 10 * 60;

interface UpstreamStation {
  station: number;
  name: string;
  lat: number;
  lon: number;
  ele: number | null;
  owner: string | null;
  ending: number | null;
}

interface XmlStation {
  "@_id": string;
  name: string;
  time?: string;
  atime?: string;
  link: string;
  F?: string;
  D?: string;
  FX?: string;
  FG?: string;
  T?: string;
  W?: string;
  V?: string;
  R?: string;
  forecast?: Array<{
    ftime: string;
    F: string;
    D: string;
    T: string;
    W: string;
  }>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  isArray: (name) => name === "station" || name === "forecast",
});

function number(value: string | undefined): number | null {
  return value === undefined || value.trim() === "" ? null : Number(value);
}

function text(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value;
}

// Veðurstofa times are Icelandic local time, which is UTC all year.
function isoTime(value: string | undefined): string | null {
  return value ? `${value.replace(" ", "T")}Z` : null;
}

async function fetchStations() {
  const res = await fetch(STATIONS_URL);
  if (!res.ok) throw new Error(`Failed to fetch stations: ${res.status}`);
  const stations = await res.json<UpstreamStation[]>();
  return stations
    .filter((station) => station.ending === null)
    .map((station) => ({
      id: station.station,
      name: station.name,
      latitude: station.lat,
      longitude: station.lon,
      elevation: station.ele,
      owner: station.owner,
    }));
}

async function fetchXml(type: "obs" | "forec", id: string) {
  const url = `${XML_URL}?op_w=xml&type=${type}&lang=en&view=xml&ids=${id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch weather: ${res.status}`);
  const root = type === "obs" ? "observations" : "forecasts";
  const xml = parser.parse(await res.text()) as Record<
    string,
    { station?: XmlStation[] } | ""
  >;
  const container = xml[root];
  return (container === "" ? undefined : container?.station?.[0]) ?? null;
}

async function fetchObservation(id: string) {
  const station = await fetchXml("obs", id);
  if (!station) return null;
  return {
    id: Number(station["@_id"]),
    name: station.name,
    time: isoTime(station.time),
    temperature: number(station.T),
    windSpeed: number(station.F),
    windDirection: text(station.D),
    windSpeedMax: number(station.FX),
    windGust: number(station.FG),
    precipitation: number(station.R),
    visibility: text(station.V),
    weather: text(station.W),
    link: station.link,
  };
}

async function fetchForecast(id: string) {
  const station = await fetchXml("forec", id);
  return (station?.forecast ?? []).map((forecast) => ({
    time: isoTime(forecast.ftime),
    temperature: number(forecast.T),
    windSpeed: number(forecast.F),
    windDirection: text(forecast.D),
    weather: text(forecast.W),
  }));
}

async function weather(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const pretty = url.searchParams.get("pretty") === "true";

  if (!params.station) {
    const stations = await withCache(
      "weather-stations",
      STATIONS_TTL_SECONDS,
      fetchStations,
    );
    const res = response(stations, pretty);
    res.headers.set("Cache-Control", cacheControl(STATIONS_TTL_SECONDS));
    return res;
  }

  if (!/^\d+$/.test(params.station)) {
    return response({ error: "station must be a numeric id" }, false, 400);
  }

  const id = params.station;
  const observation = await withCache(`weather-obs-${id}`, TTL_SECONDS, () =>
    fetchObservation(id),
  );
  if (!observation) {
    return response({ error: `Unknown station ${id}` }, false, 404);
  }

  const data =
    url.searchParams.get("forecast") === "true"
      ? {
          ...observation,
          forecast: await withCache(`weather-forecast-${id}`, TTL_SECONDS, () =>
            fetchForecast(id),
          ),
        }
      : observation;

  const res = response(data, pretty);
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

weather.meta = {
  endpoint: "/x/weather/{station}",
  description:
    "Weather from Veðurstofa Íslands. Without {station}, lists active stations. With a station id, returns the latest observation; add ?forecast=true for the hourly forecast.",
};

weather.health = {
  params: { station: "1" },
  schema: z.object({
    id: z.number(),
    name: z.string(),
    time: z.iso.datetime(),
    temperature: z.number().nullable(),
    windSpeed: z.number().nullable(),
    windDirection: z.string().nullable(),
    windSpeedMax: z.number().nullable(),
    windGust: z.number().nullable(),
    precipitation: z.number().nullable(),
    visibility: z.string().nullable(),
    weather: z.string().nullable(),
    link: z.string(),
  }),
};

export default weather;
