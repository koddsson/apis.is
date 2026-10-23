import { cacheControl, withCache } from "../cache.ts";
import { expectNonEmptyArray } from "../health.ts";
import { response } from "../utils.ts";

const CONDITIONS_URL = "https://gagnaveita.vegagerdin.is/api/faerd2017_1";
const WEATHER_URL = "https://gagnaveita.vegagerdin.is/api/vedur2014_1";
const TTL_SECONDS = 5 * 60;

interface UpstreamSegment {
  IdButur: number;
  StuttNafnButs: string;
  FulltNafnButs: string;
  AstandYfirbord: string;
  AstandLysingEn: string | null;
  AsthungiLysingEn: string | null;
  DagsSkrad: string;
  DagsButurBreyttist: string | null;
}

interface UpstreamStation {
  Nr: number;
  Nafn: string;
  Breidd: number;
  Lengd: number;
  Haed: number | null;
  Dags: string;
  Vindatt: number | null;
  VindattAscEng: string | null;
  Vindhradi: number | null;
  Vindhvida: number | null;
  Hiti: number | null;
  Veghiti: number | null;
  Raki: number | null;
  Daggarmark: number | null;
  Umf10Min: number | null;
  UmfSum: number | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch road data: ${res.status}`);
  return res.json<T>();
}

// "23.10.2026 13:40:00" in Icelandic local time, which is UTC.
export function parseStationTime(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}T${match[4]}Z` : null;
}

async function fetchConditions() {
  const segments = await fetchJson<UpstreamSegment[]>(CONDITIONS_URL);
  return segments.map((segment) => ({
    id: segment.IdButur,
    name: segment.StuttNafnButs,
    fullName: segment.FulltNafnButs,
    condition: segment.AstandLysingEn,
    conditionCode: segment.AstandYfirbord,
    weightLimit: segment.AsthungiLysingEn,
    updated: segment.DagsSkrad,
    changed: segment.DagsButurBreyttist,
  }));
}

async function fetchWeather() {
  const stations = await fetchJson<UpstreamStation[]>(WEATHER_URL);
  return stations.map((station) => ({
    id: station.Nr,
    name: station.Nafn,
    latitude: station.Breidd,
    longitude: station.Lengd,
    elevation: station.Haed,
    time: parseStationTime(station.Dags),
    temperature: station.Hiti,
    roadTemperature: station.Veghiti,
    windSpeed: station.Vindhradi,
    windGust: station.Vindhvida,
    windDirection: station.VindattAscEng,
    windDirectionDegrees: station.Vindatt,
    humidity: station.Raki,
    dewPoint: station.Daggarmark,
    traffic: { last10Minutes: station.Umf10Min, today: station.UmfSum },
  }));
}

function cached(data: unknown[], request: Request) {
  const res = response(
    data,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

export async function roadConditions(request: Request): Promise<Response> {
  return cached(
    await withCache("roads-conditions", TTL_SECONDS, fetchConditions),
    request,
  );
}

roadConditions.meta = {
  endpoint: "/x/roads/conditions",
  description:
    "Road conditions per road segment from Vegagerðin (passable, slippery, closed, …).",
};

roadConditions.health = { check: expectNonEmptyArray };

export async function roadWeather(request: Request): Promise<Response> {
  return cached(
    await withCache("roads-weather", TTL_SECONDS, fetchWeather),
    request,
  );
}

roadWeather.meta = {
  endpoint: "/x/roads/weather",
  description:
    "Roadside weather station readings from Vegagerðin: wind, gusts, air and road temperature, and traffic counts.",
};

roadWeather.health = { check: expectNonEmptyArray };
