import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// The JSON behind Veðurstofa's avalanche pages at gottvedur.is/snjoflod.
const SOURCE_URL = "https://www.gottvedur.is/api/avalanche/forecast";
const TTL_SECONDS = 10 * 60;

const REGIONS = ["SV", "VN", "TN", "EY", "AF"];
const LANGUAGES = ["is", "en"];

// The site colours these green to black, the 1-5 European danger scale.
const LEVELS: Record<string, number | null> = {
  NoForecast: null,
  Stable: 1,
  StableToModerate: 2,
  ModerateToPoor: 3,
  Poor: 4,
  Unstable: 5,
};

const Problem = z.object({
  type: z.string(),
  elevation: z.string(),
  elevationMeters: z.number().nullable(),
  aspectFrom: z.string().nullable(),
  aspectTo: z.string().nullable(),
  probability: z.string().nullable(),
  size: z.number().nullable(),
  description: z.string(),
});

const Region = z.object({
  id: z.string(),
  name: z.string(),
  updated: z.iso.datetime(),
  validFrom: z.iso.date(),
  validTo: z.iso.date(),
  danger: z.array(
    z.object({
      date: z.iso.date(),
      level: z.number().int().min(1).max(5).nullable(),
    }),
  ),
  problems: z.array(Problem),
  keyPoints: z.string(),
  snowpack: z.string(),
  weather: z.string(),
  recentAvalanches: z.string(),
});
type Region = z.infer<typeof Region>;

const Forecast = z.object({
  summary: z.string().nullable(),
  updated: z.iso.datetime().nullable(),
  regions: z.array(Region),
});
type Forecast = z.infer<typeof Forecast>;

interface UpstreamDetails {
  regionId: string;
  regionName: string;
  keypoints: string;
  recentAvalanches: string;
  weatherForecast: string;
  snowpack: string;
  createdAt: string;
  validFrom: string;
  validTo: string;
  problems: Array<{
    type: string;
    height: string;
    heightMeters: number | null;
    aspectFrom: string | null;
    aspectTo: string | null;
    probability: string | null;
    size: number | null;
    description: string;
  }>;
  dangers: Record<string, string>;
}

// "WindDrift" -> "wind-drift"
function kebab(value: string): string {
  return value.replace(/(?<=[a-z])(?=[A-Z])/g, "-").toLowerCase();
}

// Times come without a zone, in Icelandic time, which is UTC.
function utc(time: string): string {
  return new Date(`${time}Z`).toISOString();
}

async function get<T>(path: string, lang: string): Promise<T | null> {
  const res = await fetch(`${SOURCE_URL}/${path}?lang=${lang}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch avalanche ${path}: ${res.status}`);
  }
  return res.status === 204 ? null : res.json<T>();
}

function region(details: UpstreamDetails): Region {
  return {
    id: details.regionId,
    name: details.regionName,
    updated: utc(details.createdAt),
    validFrom: details.validFrom.slice(0, 10),
    validTo: details.validTo.slice(0, 10),
    danger: Object.entries(details.dangers).map(([date, danger]) => ({
      date: date.slice(0, 10),
      level: LEVELS[danger] ?? null,
    })),
    problems: details.problems.map((problem) => ({
      type: kebab(problem.type),
      elevation: problem.height.toLowerCase(),
      elevationMeters: problem.heightMeters,
      aspectFrom: problem.aspectFrom?.toUpperCase() ?? null,
      aspectTo: problem.aspectTo?.toUpperCase() ?? null,
      probability: problem.probability && kebab(problem.probability),
      size: problem.size,
      description: problem.description,
    })),
    keyPoints: details.keypoints.trim(),
    snowpack: details.snowpack.trim(),
    weather: details.weatherForecast.trim(),
    recentAvalanches: details.recentAvalanches.trim(),
  };
}

async function fetchForecast(lang: string): Promise<Forecast> {
  const [status, ...details] = await Promise.all([
    get<{ summary: string; createdTime: string }>("status/", lang),
    ...REGIONS.map((id) => get<UpstreamDetails>(`details/${id}/`, lang)),
  ]);
  return {
    summary: status?.summary.trim() ?? null,
    updated: status ? utc(status.createdTime) : null,
    regions: details.flatMap((entry) => (entry ? [region(entry)] : [])),
  };
}

async function avalanche(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "is";
  if (!LANGUAGES.includes(lang)) {
    return response({ error: "lang must be is or en" }, false, 400);
  }
  const id = url.searchParams.get("region")?.toUpperCase();
  if (id && !REGIONS.includes(id)) {
    return response(
      { error: `region must be one of ${REGIONS.join(", ")}` },
      false,
      404,
    );
  }

  const forecast = await withCache(`avalanche:${lang}`, TTL_SECONDS, () =>
    fetchForecast(lang),
  );
  const data = id
    ? { ...forecast, regions: forecast.regions.filter((r) => r.id === id) }
    : forecast;

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

avalanche.meta = {
  endpoint: "/x/avalanche",
  description:
    "Veðurstofa's avalanche forecast for Iceland's 5 forecast regions (SV, VN, TN, EY, AF): daily danger level (1 low to 5 very high), avalanche problems, key points, snowpack, weather and recent avalanches. Optional ?region= and ?lang= (is, en). Seasonal; regions without a forecast are left out.",
};

avalanche.health = { schema: Forecast };

export default avalanche;
