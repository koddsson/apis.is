import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const SOURCE_URL = "https://island.is/api/graphql";
const SERIES_KEY =
  "icelandicRadiationSafetyAuthority.ultravioletRadiation.measurementSeriesPast72Hours";
const QUERY =
  "query($i: StatisticsQueryInput!){getStatisticsByKeys(input:$i){statistics{header statisticsForHeader{key value}}}}";
const TTL_SECONDS = 10 * 60;

const Measurement = z.object({
  time: z.iso.datetime(),
  uvIndex: z.number(),
});

const Uv = z.object({
  location: z.string(),
  latest: Measurement,
  past72Hours: z.array(Measurement).min(1),
});
type Uv = z.infer<typeof Uv>;

const Upstream = z.object({
  data: z.object({
    getStatisticsByKeys: z.object({
      statistics: z.array(
        z.object({
          header: z.string().regex(/^\d+$/),
          statisticsForHeader: z
            .array(z.object({ key: z.literal(SERIES_KEY), value: z.number() }))
            .length(1),
        }),
      ),
    }),
  }),
});

async function fetchUv(): Promise<Uv> {
  const res = await fetch(SOURCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      // Without numberOfDataPoints island.is returns only the last six.
      variables: {
        i: { sourceDataKeys: [SERIES_KEY], numberOfDataPoints: 1000 },
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to fetch UV index: ${res.status}`);
  const parsed = Upstream.safeParse(await res.json());
  if (!parsed.success) throw new Error("Unexpected UV index response");

  const series = parsed.data.data.getStatisticsByKeys.statistics
    .map(({ header, statisticsForHeader: [{ value }] }) => ({
      time: new Date(Number(header)).toISOString(),
      uvIndex: value,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
  const latest = series.at(-1);
  if (!latest) throw new Error("No UV index measurements");

  return {
    location: "Rauðarárstígur, Reykjavík",
    latest,
    past72Hours: series,
  };
}

async function uv(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const data = await withCache("uv", TTL_SECONDS, fetchUv);
  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

uv.meta = {
  endpoint: "/x/uv",
  description:
    "UV index from Geislavarnir ríkisins' meter at Rauðarárstígur, Reykjavík: the latest measurement and the past 72 hours. Near zero from October to March.",
};

uv.health = { schema: Uv };

export default uv;
