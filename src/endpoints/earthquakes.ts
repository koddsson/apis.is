import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const SOURCE_URL = "https://en.vedur.is/earthquakes-and-volcanism/earthquakes";
const TTL_SECONDS = 120;
const MAX_HOURS = 48;

const Earthquake = z.object({
  time: z.iso.datetime(),
  latitude: z.number(),
  longitude: z.number(),
  depth: z.number(),
  magnitude: z.number(),
  quality: z.number(),
  verified: z.boolean(),
  place: z.string(),
  distance: z.number(),
  direction: z.string(),
});
type Earthquake = z.infer<typeof Earthquake>;

// The page embeds the last 48 hours as a JS literal: VI.quakeInfo = [{...}, ...];
// Times are `new Date(year, month - 1, day, hour, minute, second)` in UTC.
export function parseQuakes(html: string): Earthquake[] {
  const list = /VI\.quakeInfo = \[(.*?)\];/s.exec(html);
  if (!list) throw new Error("Earthquake list not found on vedur.is page");

  return [...list[1].matchAll(/\{(.*?)\}/g)].map(([, entry]) => {
    const field = (name: string) =>
      new RegExp(`'${name}':'([^']*)'`).exec(entry)?.[1] ?? "";
    const date = /new Date\((\d+),(\d+)-1,(\d+),(\d+),(\d+),(\d+)\)/.exec(
      entry,
    );
    if (!date) throw new Error(`Unexpected earthquake entry: ${entry}`);
    const [year, month, day, hour, minute, second] = date.slice(1).map(Number);

    return {
      time: new Date(
        Date.UTC(year, month - 1, day, hour, minute, second),
      ).toISOString(),
      latitude: Number(field("lat")),
      longitude: Number(field("lon")),
      depth: Number(field("dep")),
      magnitude: Number(field("s")),
      quality: Number(field("q")),
      verified: false,
      place: field("dR"),
      distance: Number(field("dL")),
      direction: field("dD"),
    };
  });
}

function parseNumber(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : null;
}

async function fetchQuakes(): Promise<Earthquake[]> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch earthquakes: ${res.status}`);
  return parseQuakes(await res.text());
}

async function earthquakes(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const hours = parseNumber(url.searchParams.get("hours"), MAX_HOURS);
  const minMagnitude = parseNumber(
    url.searchParams.get("min_magnitude"),
    Number.NEGATIVE_INFINITY,
  );

  if (hours === null || hours <= 0 || hours > MAX_HOURS) {
    return response(
      { error: `hours must be a number between 0 and ${MAX_HOURS}` },
      false,
      400,
    );
  }
  if (minMagnitude === null) {
    return response({ error: "min_magnitude must be a number" }, false, 400);
  }

  const quakes = await withCache("earthquakes", TTL_SECONDS, fetchQuakes);
  const since = Date.now() - hours * 60 * 60 * 1000;
  const result = quakes.filter(
    (quake) =>
      Date.parse(quake.time) >= since && quake.magnitude >= minMagnitude,
  );

  const res = response(result, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

earthquakes.meta = {
  endpoint: "/x/earthquakes",
  description:
    "Earthquakes in Iceland from the last 48 hours (preliminary, from Veðurstofa Íslands). Optional ?hours= and ?min_magnitude= filters.",
};

earthquakes.health = { schema: z.array(Earthquake) };

export default earthquakes;
