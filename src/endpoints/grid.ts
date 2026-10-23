import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// The feeds behind landsnet.is's real-time grid map; not a documented API.
const MEASUREMENTS_URL = "https://amper.landsnet.is/MapData/api/measurements";
const MAP_URL = "https://amper.landsnet.is/MapData/api/lndata2";
const TTL_SECONDS = 60;
const MAP_TTL_SECONDS = 24 * 60 * 60;

interface Measurement {
  time: string;
  MW: number;
  key: string;
  substation: string | null;
  good: number;
  stop: number;
}

interface GridMap {
  TransmissionLine: Array<{ MeasureType: string; Name: string }>;
  Snid: Array<{ key: string; name: string; intersects: string[] }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    // Landsnet is behind Cloudflare; the ray's suffix names the blocked colo.
    const ray = res.headers.get("cf-ray");
    const body = (await res.text())
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ");
    throw new Error(
      `Failed to fetch grid data: ${res.status}${ray ? ` (cf-ray ${ray})` : ""} ${body.trim().slice(0, 200)}`.trim(),
    );
  }
  return res.json<T>();
}

async function fetchGrid() {
  const [measurements, map] = await Promise.all([
    fetchJson<Measurement[]>(MEASUREMENTS_URL),
    withCache("grid-map", MAP_TTL_SECONDS, () => fetchJson<GridMap>(MAP_URL)),
  ]);
  const byKey = new Map(measurements.map((m) => [m.key, m]));
  const lineNames = new Map(
    map.TransmissionLine.map((line) => [line.MeasureType, line.Name]),
  );
  const sectionKeys = new Set(map.Snid.map((section) => section.key));
  const aggregates = new Set(["TOTAL_POWER_FLOW", "REGULATING_POWER"]);

  return {
    // Landsnet times are Icelandic local time, which is UTC.
    time: measurements[0] ? `${measurements[0].time}Z` : null,
    totalPowerFlow: byKey.get("TOTAL_POWER_FLOW")?.MW ?? null,
    regulatingPower: byKey.get("REGULATING_POWER")?.MW ?? null,
    regionalFlows: map.Snid.map((section) => ({
      id: section.key,
      name: section.name,
      lines: section.intersects,
      flow: byKey.get(section.key)?.MW ?? null,
    })),
    lines: measurements
      .filter((m) => !aggregates.has(m.key) && !sectionKeys.has(m.key))
      .map((m) => ({
        id: m.key,
        name: lineNames.get(m.key) ?? null,
        substation: m.substation,
        flow: m.MW,
        stopped: m.stop === 1,
        reliable: m.good === 1,
      })),
  };
}

async function grid(request: Request): Promise<Response> {
  const data = await withCache("grid", TTL_SECONDS, fetchGrid);
  const res = response(
    data,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

grid.meta = {
  endpoint: "/x/grid",
  description:
    "Live Icelandic transmission grid from Landsnet: total power flow, regional flows across the main cross-sections, and flow per line in MW. Production by source isn't published.",
};

grid.health = {
  check: (data: unknown) => {
    const total = (data as { totalPowerFlow?: unknown }).totalPowerFlow;
    return typeof total === "number" && total > 0
      ? undefined
      : `Expected a positive total power flow, got ${JSON.stringify(total)}`;
  },
};

export default grid;
