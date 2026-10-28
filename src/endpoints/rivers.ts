import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { date, fetchGraph, type Graph } from "../landsvirkjun.ts";
import { response } from "../utils.ts";

const TTL_SECONDS = 60 * 60;

const OVERFLOW = /^Rennsli um yfirfall (\d{4})$/;

interface Source {
  slug: string;
  graph: string;
  seasonal: boolean;
  rivers: Array<{
    id: string;
    name: string;
    measured: string | RegExp;
    forecast?: string;
  }>;
}

const SOURCES: Source[] = [
  {
    slug: "rennsli-thjorsar-nedan-burfells",
    graph: "thjorsa-nedri",
    seasonal: false,
    rivers: [
      {
        id: "thjorsa-burfell",
        name: "Þjórsá neðan Búrfells",
        measured: "Mælt rennsli",
        forecast: "Spá um rennsli",
      },
    ],
  },
  {
    slug: "blanda-rennsli-nedan-virkjunar",
    graph: "langamyri",
    seasonal: false,
    rivers: [
      {
        id: "blanda-langamyri",
        name: "Blanda neðan Blöndustöðvar við Löngumýri",
        measured: "Rennsli neðan virkjunar (Við Löngumýri)",
      },
    ],
  },
  {
    slug: "rennsli-um-yfirfall-halslons",
    graph: "halslon",
    seasonal: true,
    rivers: [
      { id: "halslon-overflow", name: "Yfirfall Hálslóns", measured: OVERFLOW },
    ],
  },
  {
    slug: "rennsli-um-yfirfall-blondulons",
    graph: "blondulon",
    seasonal: true,
    rivers: [
      {
        id: "blondulon-overflow",
        name: "Yfirfall Blöndulóns",
        measured: OVERFLOW,
      },
    ],
  },
  {
    slug: "sumarrennsli-jokulsar-i-fljotsdal",
    graph: "jokulsa",
    seasonal: true,
    rivers: [
      {
        id: "jokulsa-holl",
        name: "Jökulsá í Fljótsdal við Hól",
        measured: "Rennsli við Hól",
      },
      {
        id: "jokulsa-hrakstrandarfoss",
        name: "Jökulsá í Fljótsdal við Hrakstrandarfoss",
        measured: "Rennsli við Hrakstrandarfoss",
      },
    ],
  },
];

const IDS = new Set(
  SOURCES.flatMap((source) => source.rivers.map((river) => river.id)),
);

const Flow = z.object({ date: z.iso.date(), flow: z.number() });
type Flow = z.infer<typeof Flow>;

const River = z.object({
  id: z.string(),
  name: z.string(),
  url: z.url(),
  unit: z.string(),
  latest: Flow.nullable(),
  measured: z.array(Flow),
  forecast: z.array(Flow),
});
type River = z.infer<typeof River>;

type Series = Graph["series"][number];

function findSeries(graph: Graph, name: string | RegExp) {
  if (typeof name === "string") {
    const series = graph.series.find((series) => series.name === name);
    return series && { series, year: undefined };
  }
  let latest: { series: Series; year: string } | undefined;
  for (const series of graph.series) {
    const year = name.exec(series.name)?.[1];
    if (year && (!latest || year > latest.year)) latest = { series, year };
  }
  return latest;
}

function flows(series: Series | undefined, year?: string): Flow[] {
  return (series?.data ?? []).flatMap(([timestamp, flow]) => {
    if (flow == null) return [];
    const day = date(timestamp);
    // Overflow pages plot every year's series on the current year's axis.
    return [{ date: year ? year + day.slice(4) : day, flow }];
  });
}

async function fetchSource(source: Source): Promise<River[]> {
  const { url, graph } = await fetchGraph(source.slug);
  if (graph.id !== source.graph) {
    throw new Error(`Unexpected graph data on ${source.slug}`);
  }
  return source.rivers.map((river) => {
    const found = findSeries(graph, river.measured);
    const forecast = river.forecast
      ? graph.series.find((series) => series.name === river.forecast)
      : undefined;
    if (!found?.series.uom || (river.forecast && !forecast)) {
      throw new Error(`Unexpected graph data on ${source.slug}`);
    }
    const measured = flows(found.series, found.year);
    if (!source.seasonal && measured.length === 0) {
      throw new Error(`No flow readings on ${source.slug}`);
    }
    return {
      id: river.id,
      name: river.name,
      url,
      unit: found.series.uom,
      latest: measured.at(-1) ?? null,
      measured,
      forecast: flows(forecast),
    };
  });
}

async function fetchRivers(): Promise<River[]> {
  return (await Promise.all(SOURCES.map(fetchSource))).flat();
}

async function rivers(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("river");
  if (id !== null && !IDS.has(id)) {
    return response({ error: `Unknown river ${id}` }, false, 404);
  }

  const all = await withCache("rivers", TTL_SECONDS, fetchRivers);
  const data = id !== null ? all.filter((river) => river.id === id) : all;

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

rivers.meta = {
  endpoint: "/x/rivers",
  description:
    "Daily river flow (m3/s) at Landsvirkjun's measuring points: Þjórsá below Búrfell with a 6-day forecast, Blanda below Blöndustöð, overflow from Hálslón and Blöndulón, and summer flow in Jökulsá í Fljótsdal. Optional ?river= id filter.",
};

rivers.health = { schema: z.array(River).length(6) };

export default rivers;
