import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { date, fetchGraph, type Point } from "../landsvirkjun.ts";
import { response } from "../utils.ts";

const TTL_SECONDS = 60 * 60;

const RESERVOIRS: Record<string, string> = {
  halslon: "vatnshaed-halslons",
  thorisvatn: "vatnshaed-thorisvatns",
  blondulon: "vatnshaed-blondulons",
  thingvallavatn: "vatnshaed-thingvallavatns",
};

const Day = z.object({
  date: z.iso.date(),
  level: z.number(),
  expectedMean: z.number().nullable(),
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
  lastYear: z.number().nullable(),
});
type Day = z.infer<typeof Day>;

const Reservoir = z.object({
  id: z.string(),
  name: z.string(),
  url: z.url(),
  overflowLevel: z.number().nullable(),
  latest: Day,
  series: z.array(Day).min(1),
});
type Reservoir = z.infer<typeof Reservoir>;

function byDate(points: Point[] | undefined, index = 1) {
  return new Map(points?.map((point) => [date(point[0]), point[index]]));
}

async function fetchReservoir(id: string, slug: string): Promise<Reservoir> {
  const { url, graph } = await fetchGraph(slug);

  const series = new Map(graph.series.map((s) => [s.name, s.data]));
  // Þingvallavatn only has a single "Vatnshæð" series covering the past year.
  const current = series.get("Núverandi vatnsár") ?? series.get("Vatnshæð");
  if (!current || graph.id !== id) {
    throw new Error(`Unexpected graph data on ${slug}`);
  }
  const mean = byDate(series.get("Áætlað meðaltal"));
  const minimum = byDate(series.get("Lægsta gildi, hæsta gildi"));
  const maximum = byDate(series.get("Lægsta gildi, hæsta gildi"), 2);
  const lastYear = byDate(series.get("Síðasta vatnsár"));
  const overflow = byDate(series.get("Yfirfall"));

  const days = current.flatMap(([timestamp, level]): Day[] => {
    if (level == null) return [];
    const day = date(timestamp);
    return [
      {
        date: day,
        level,
        expectedMean: mean.get(day) ?? null,
        minimum: minimum.get(day) ?? null,
        maximum: maximum.get(day) ?? null,
        lastYear: lastYear.get(day) ?? null,
      },
    ];
  });
  const latest = days.at(-1);
  if (!latest) throw new Error(`No water level readings on ${slug}`);

  return {
    id,
    name: graph.title,
    url,
    overflowLevel: overflow.get(latest.date) ?? null,
    latest,
    series: days,
  };
}

function fetchReservoirs(): Promise<Reservoir[]> {
  return Promise.all(
    Object.entries(RESERVOIRS).map(([id, slug]) => fetchReservoir(id, slug)),
  );
}

async function reservoirs(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("reservoir");
  if (id !== null && !Object.hasOwn(RESERVOIRS, id)) {
    return response({ error: `Unknown reservoir ${id}` }, false, 404);
  }

  const all = await withCache("reservoirs", TTL_SECONDS, fetchReservoirs);
  const data =
    id !== null ? all.filter((reservoir) => reservoir.id === id) : all;

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

reservoirs.meta = {
  endpoint: "/x/reservoirs",
  description:
    "Daily water levels (m above sea level) in Landsvirkjun's reservoirs Hálslón, Þórisvatn, Blöndulón and Þingvallavatn for the current water year, with the expected mean, historical min/max, last year's level and the overflow level. Optional ?reservoir= id filter.",
};

reservoirs.health = { schema: z.array(Reservoir).length(4) };

export default reservoirs;
