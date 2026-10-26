import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// Reykjavík's ArcGIS server (Borgarvefsjá), reprojected to WGS84.
const ARCGIS_URL = "https://borgarvefsja.reykjavik.is/arcgis/rest/services";
const CONGESTION_URL = `${ARCGIS_URL}/Borgarvefsja/LifandiGogn/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json`;
const CLOSURES_URL = `${ARCGIS_URL}/Framkvaemdasja/Framkvaemdakort/MapServer/0/query?where=ENDIR%3ECURRENT_TIMESTAMP&outFields=*&outSR=4326&f=json`;
const CONGESTION_TTL_SECONDS = 90;
const CLOSURES_TTL_SECONDS = 15 * 60;

const CONGESTION = [
  "free",
  "light",
  "slow",
  "very-slow",
  "queuing",
  "unknown",
  "unknown",
] as const;

const CLOSURE_TYPES = {
  "Akbraut lokuð": "closed",
  "Akbraut þrengd": "narrowed",
} as const;

const STATUSES = {
  "Í gangi": "in-progress",
  Framundan: "upcoming",
  Lokið: "finished",
} as const;
const STATUS_NAMES: string[] = Object.values(STATUSES);

const Geometry = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

const Segment = z.object({
  id: z.number(),
  road: z.string(),
  level: z.number().int().min(0).max(4).nullable(),
  congestion: z.enum(CONGESTION),
  updated: z.iso.datetime(),
  geometry: Geometry,
});
type Segment = z.infer<typeof Segment>;

const Closure = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(Object.values(CLOSURE_TYPES)),
  status: z.enum(Object.values(STATUSES)),
  start: z.iso.datetime().nullable(),
  end: z.iso.datetime(),
  municipality: z.string().nullable(),
  url: z.string().nullable(),
  geometry: Geometry,
});
type Closure = z.infer<typeof Closure>;

interface UpstreamFeature<T> {
  attributes: T;
  geometry: { paths: [number, number][][] };
}

interface UpstreamSegment {
  OBJECTID: number;
  NAFNFITJU: string;
  LEVELOFSERVICE: number;
  DAGSTIMI: number;
}

interface UpstreamClosure {
  ID: string;
  UPPHAF: number | null;
  ENDIR: number;
  TITILL: string;
  LYSING: string | null;
  LOKUN: string;
  SVEITARFELAG: string | null;
  LINK_ID: number | null;
  URL: string | null;
  VERKSTADA: string;
}

async function query<T>(url: string, what: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${what}: ${res.status}`);
  // ArcGIS reports errors with a 200 status and an error body.
  const body = await res.json<{
    features?: UpstreamFeature<T>[];
    error?: { message: string };
  }>();
  if (!body.features) {
    throw new Error(
      `Failed to fetch ${what}: ${body.error?.message ?? "no features"}`,
    );
  }
  return body.features;
}

function isoTime(epoch: number): string {
  return new Date(epoch).toISOString();
}

async function fetchSegments(): Promise<Segment[]> {
  const features = await query<UpstreamSegment>(
    CONGESTION_URL,
    "Reykjavík congestion",
  );
  return features.map(({ attributes: segment, geometry }) => {
    const congestion = CONGESTION[segment.LEVELOFSERVICE];
    if (!congestion) {
      throw new Error(`Unknown level of service ${segment.LEVELOFSERVICE}`);
    }
    return {
      id: segment.OBJECTID,
      road: segment.NAFNFITJU,
      level: segment.LEVELOFSERVICE <= 4 ? segment.LEVELOFSERVICE : null,
      congestion,
      updated: isoTime(segment.DAGSTIMI),
      geometry: { type: "MultiLineString", coordinates: geometry.paths },
    };
  });
}

function lookup<T>(map: Record<string, T>, value: string, what: string): T {
  const mapped = map[value];
  if (!mapped) throw new Error(`Unknown closure ${what} "${value}"`);
  return mapped;
}

async function fetchClosures(): Promise<Closure[]> {
  const features = await query<UpstreamClosure>(
    CLOSURES_URL,
    "Reykjavík street closures",
  );

  // Each closure is one feature per street link, often repeated.
  const closures = new Map<string, Closure>();
  const links = new Map<string, Set<number | null>>();
  for (const { attributes: closure, geometry } of features) {
    let entry = closures.get(closure.ID);
    if (!entry) {
      entry = {
        id: closure.ID,
        title: closure.TITILL.trim(),
        description: closure.LYSING?.trim() || null,
        type: lookup(CLOSURE_TYPES, closure.LOKUN, "type"),
        status: lookup(STATUSES, closure.VERKSTADA, "status"),
        start: closure.UPPHAF === null ? null : isoTime(closure.UPPHAF),
        end: isoTime(closure.ENDIR),
        municipality: closure.SVEITARFELAG,
        url: closure.URL,
        geometry: { type: "MultiLineString", coordinates: [] },
      };
      closures.set(closure.ID, entry);
      links.set(closure.ID, new Set());
    }
    const seen = links.get(closure.ID) as Set<number | null>;
    if (closure.LINK_ID !== null && seen.has(closure.LINK_ID)) continue;
    seen.add(closure.LINK_ID);
    entry.geometry.coordinates.push(...geometry.paths);
  }
  const soonest = (closure: Closure) => closure.start ?? closure.end;
  return [...closures.values()].sort((a, b) =>
    soonest(a).localeCompare(soonest(b)),
  );
}

export async function reykjavikTraffic(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const segments = await withCache(
    "reykjavik-traffic",
    CONGESTION_TTL_SECONDS,
    fetchSegments,
  );

  const road = url.searchParams.get("road")?.toLocaleLowerCase("is");
  const data = road
    ? segments.filter(
        (segment) => segment.road.toLocaleLowerCase("is") === road,
      )
    : segments;
  if (road && data.length === 0) {
    return response(
      { error: `Unknown road ${url.searchParams.get("road")}` },
      false,
      404,
    );
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(CONGESTION_TTL_SECONDS));
  return res;
}

reykjavikTraffic.meta = {
  endpoint: "/x/traffic/reykjavik",
  description:
    "Live congestion on major Reykjavík road segments from the city's traffic map, refreshed every ~90 seconds: level 0 (free flow) to 4 (queuing), or null when unknown, with each segment's GeoJSON line. Optional ?road= name filter.",
};

reykjavikTraffic.health = { schema: z.array(Segment).min(1) };

export async function streetClosures(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status && !STATUS_NAMES.includes(status)) {
    return response(
      { error: `status must be one of ${STATUS_NAMES.join(", ")}` },
      false,
      400,
    );
  }

  const closures = await withCache(
    "street-closures",
    CLOSURES_TTL_SECONDS,
    fetchClosures,
  );
  const data = status
    ? closures.filter((closure) => closure.status === status)
    : closures;

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(CLOSURES_TTL_SECONDS));
  return res;
}

streetClosures.meta = {
  endpoint: "/x/roads/closures",
  description:
    "Current and upcoming street closures and lane narrowings from Reykjavík's works map, soonest first: title, description, type (closed, narrowed), status, start and end, with the affected streets as a GeoJSON line. Optional ?status= (in-progress, upcoming, finished) filter.",
};

streetClosures.health = { schema: z.array(Closure) };
