import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const SOURCE_URL = "https://www.vedur.is/vedur/spar/nordurljos/";
const TTL_SECONDS = 30 * 60;

const ACTIVITY = [
  "Minimum",
  "Quiet",
  "Low",
  "Moderate",
  "Active",
  "High",
  "Very high",
  "Strong",
  "Severe",
  "Extreme",
] as const;

// Visibility, then which entries of the moon array hold the rise and set times.
const MOON = {
  t0: ["not-visible", null, null],
  t1: ["all-night", null, null],
  t2: ["rises", 2, null],
  t3: ["sets", null, 2],
  t4: ["rises-and-sets", 2, 3],
  t5: ["sets-and-rises", 3, 2],
} as const;

const LAYERS: Record<string, string> = {
  skyjahula: "low-and-mid",
  lagsky: "low",
  midsky: "mid",
  hasky: "high",
  samsett: "total",
};

const Time = z.iso.datetime();

const Night = z.object({
  date: z.iso.date(),
  activity: z.number().int().min(0).max(9),
  activityLabel: z.enum(ACTIVITY),
  sunset: Time,
  sunrise: Time,
  darkness: z.object({ start: Time, end: Time }).nullable(),
  moon: z.object({
    age: z.number().int().min(0).max(29),
    visibility: z.enum(Object.values(MOON).map(([visibility]) => visibility)),
    rise: Time.nullable(),
    set: Time.nullable(),
  }),
});
type Night = z.infer<typeof Night>;

const CloudCover = z.object({
  layer: z.enum(Object.values(LAYERS)),
  images: z.array(z.object({ time: Time, url: z.url() })).min(1),
});
type CloudCover = z.infer<typeof CloudCover>;

const Aurora = z.object({
  nights: z.array(Night).min(1),
  cloudCover: z.array(CloudCover),
});
type Aurora = z.infer<typeof Aurora>;

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

// Times are Reykjavík local time (UTC) for the night starting on `date`, so
// morning times belong to the next day.
function nightTime(date: string, time: string): string {
  if (!/^\d\d:\d\d$/.test(time)) throw new Error(`Unexpected time: ${time}`);
  const day = Number(time.slice(0, 2)) < 12 ? addDays(date, 1) : date;
  return `${day}T${time}:00.000Z`;
}

function strings(list: string): string[] {
  return [...list.matchAll(/'([^']*)'/g)].map((match) => match[1]);
}

function parseNight(
  key: string,
  act: string,
  sunList: string,
  moonList: string,
): Night {
  const date = `20${key.slice(0, 2)}-${key.slice(2, 4)}-${key.slice(4, 6)}`;
  const activity = Number(act);
  const sun = strings(sunList);
  const moon = strings(moonList);

  if (activity > 9) throw new Error(`Unexpected aurora activity: ${act}`);
  if (sun[0] !== "s0" && sun[0] !== "s1") {
    throw new Error(`Unexpected sun data: ${sunList}`);
  }
  if (!Object.hasOwn(MOON, moon[1])) {
    throw new Error(`Unexpected moon data: ${moonList}`);
  }
  const [visibility, rise, set] = MOON[moon[1] as keyof typeof MOON];

  return {
    date,
    activity,
    activityLabel: ACTIVITY[activity],
    sunset: nightTime(date, sun[1]),
    sunrise: nightTime(date, sun[2]),
    darkness:
      sun[0] === "s0"
        ? { start: nightTime(date, sun[3]), end: nightTime(date, sun[4]) }
        : null,
    moon: {
      age: Number(moon[0]),
      visibility,
      rise: rise === null ? null : nightTime(date, moon[rise]),
      set: set === null ? null : nightTime(date, moon[set]),
    },
  };
}

function parseCloudCover(config: string): CloudCover {
  const slug = /'url':'([^']*)'/.exec(config)?.[1] ?? "";
  const layer = LAYERS[slug];
  if (!layer) throw new Error(`Unknown cloud cover layer: ${slug}`);

  const images = [
    ...config.matchAll(
      /'(\d+)' : '([^']+)','tag\1'\s*: new Date\((\d+),(\d+)-1,(\d+),(\d+),(\d+)\)/g,
    ),
  ].map(([, , path, year, month, day, hour, minute]) => ({
    time: new Date(
      Date.UTC(+year, +month - 1, +day, +hour, +minute),
    ).toISOString(),
    url: new URL(path, SOURCE_URL).toString(),
  }));
  if (images.length === 0) {
    throw new Error(`No cloud cover images for layer ${slug}`);
  }
  return { layer, images };
}

export function parseAurora(html: string): Aurora {
  const idx = /VI\.data\.aurora\.idx = \{([\s\S]*?)\}\}/.exec(html);
  if (!idx) throw new Error("Aurora forecast not found on page");
  const nights = [
    ...`${idx[1]}}`.matchAll(
      /(\d{6}): \{act: (\d+),\s*sun: \[([^\]]*)\],\s*moon: \[([^\]]*)\]\}/g,
    ),
  ].map(([, key, act, sun, moon]) => parseNight(key, act, sun, moon));
  if (nights.length === 0) throw new Error("No nights in aurora forecast");

  const cloudCover = [...html.matchAll(/VI\.imgConf\[\d+\] = (\{.*?\});/g)].map(
    ([, config]) => parseCloudCover(config),
  );
  if (cloudCover.length === 0) throw new Error("Cloud cover maps not found");

  return { nights, cloudCover };
}

async function fetchAurora(): Promise<Aurora> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "apis.is (+https://apis.is)" },
  });
  if (!res.ok)
    throw new Error(`Failed to fetch aurora forecast: ${res.status}`);
  return parseAurora(await res.text());
}

async function aurora(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (date && !/^\d{4}-\d\d-\d\d$/.test(date)) {
    return response({ error: "date must be YYYY-MM-DD" }, false, 400);
  }

  const forecast = await withCache("aurora", TTL_SECONDS, fetchAurora);
  let data = forecast;
  if (date) {
    const nights = forecast.nights.filter((night) => night.date === date);
    if (nights.length === 0) {
      return response({ error: `No forecast for ${date}` }, false, 404);
    }
    const start = `${date}T12:00:00.000Z`;
    const end = `${addDays(date, 1)}T12:00:00.000Z`;
    data = {
      nights,
      cloudCover: forecast.cloudCover
        .map(({ layer, images }) => ({
          layer,
          images: images.filter(({ time }) => time >= start && time < end),
        }))
        .filter(({ images }) => images.length > 0),
    };
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

aurora.meta = {
  endpoint: "/x/aurora",
  description:
    "Veðurstofa's aurora forecast: activity (0–9) for each night over the next ~10 days with Reykjavík sunset, sunrise, darkness and moon times, plus hourly cloud-cover map images (low-and-mid, low, mid, high, total) for the next ~3 days. Optional ?date=YYYY-MM-DD to get a single night.",
};

aurora.health = {
  schema: Aurora.extend({ cloudCover: z.array(CloudCover).min(1) }),
};

export default aurora;
