import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const PX_URL =
  "https://px.hagstofa.is/pxen/api/v1/en/Ibuar/mannfjoldi/1_yfirlit/arsfjordungstolur";
const TTL_SECONDS = 24 * 60 * 60;
const MAX_QUARTERS = 60;
const NOTE =
  "Official quarterly figures from Hagstofa Íslands, updated a few times a year. Not a live count.";

interface JsonStat {
  value: Array<number | null>;
  dimension: {
    Ársfjórðungur: { category: { index: Record<string, number> } };
  };
}

async function query(table: string, selections: Record<string, string[]>) {
  const res = await fetch(`${PX_URL}/${table}.px`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: Object.entries(selections).map(([code, values]) => ({
        code,
        selection:
          code === "Ársfjórðungur"
            ? { filter: "top", values }
            : { filter: "item", values },
      })),
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`Failed to fetch from Hagstofa: ${res.status}`);
  const data = await res.json<JsonStat>();

  // Quarter is the only dimension with more than one value, so values line
  // up with the quarter index.
  return Object.entries(data.dimension.Ársfjórðungur.category.index)
    .sort(([, a], [, b]) => a - b)
    .map(([period, i]) => ({ period, value: data.value[i] }));
}

function cached(data: Record<string, unknown>, request: Request) {
  const res = response(
    data,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

export async function population(request: Request): Promise<Response> {
  const [latest] = await withCache("population", TTL_SECONDS, () =>
    query("MAN10001", {
      Ársfjórðungur: ["1"],
      Sveitarfélag: ["IS"],
      "Kyn og ríkisfang": ["0"],
    }),
  );
  return cached(
    {
      population: latest?.value ?? null,
      period: latest?.period ?? null,
      source: "Hagstofa Íslands, table MAN10001",
      note: NOTE,
    },
    request,
  );
}

population.meta = {
  endpoint: "/x/population",
  description:
    "Iceland's latest official population figure and the quarter it refers to, from Hagstofa Íslands.",
};

population.health = {
  schema: z.object({
    population: z.number().positive(),
    period: z.string(),
    source: z.string(),
    note: z.string(),
  }),
};

export function latestFullYear(
  quarters: Array<{ period: string; value: number | null }>,
) {
  const byYear = new Map<number, number[]>();
  for (const { period, value } of quarters) {
    if (value === null) continue;
    const year = Number(period.slice(0, 4));
    byYear.set(year, [...(byYear.get(year) ?? []), value]);
  }
  const latest = [...byYear]
    .filter(([, values]) => values.length === 4)
    .sort(([a], [b]) => b - a)[0];
  if (!latest) return null;

  const [year, values] = latest;
  const births = values.reduce((sum, n) => sum + n, 0);
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  return { year, births, perDay: Math.round((births / days) * 100) / 100 };
}

export async function births(request: Request): Promise<Response> {
  const requested = new URL(request.url).searchParams.get("quarters") ?? "8";
  const count = Number(requested);
  if (!/^\d+$/.test(requested) || count < 1 || count > MAX_QUARTERS) {
    return response(
      { error: `quarters must be a whole number from 1 to ${MAX_QUARTERS}` },
      false,
      400,
    );
  }

  const fetchCount = Math.max(count, 12);
  const quarters = await withCache(`births-${fetchCount}`, TTL_SECONDS, () =>
    query("MAN10002", {
      Ársfjórðungur: [String(fetchCount)],
      Atburður: ["0"],
      Landsvæði: ["IS"],
      "Kyn og ríkisfang": ["0"],
    }),
  );

  return cached(
    {
      periods: quarters
        .slice(-count)
        .map(({ period, value }) => ({ period, births: value })),
      latestFullYear: latestFullYear(quarters),
      source: "Hagstofa Íslands, table MAN10002",
      note: NOTE,
    },
    request,
  );
}

births.meta = {
  endpoint: "/x/population/births",
  description:
    "Births per quarter in Iceland (latest ?quarters=, default 8) and the average births per day in the latest full year, from Hagstofa Íslands.",
};

births.health = {
  schema: z.object({
    periods: z.array(
      z.object({ period: z.string(), births: z.number().nullable() }),
    ),
    latestFullYear: z.object({
      year: z.number().int(),
      births: z.number().positive(),
      perDay: z.number().positive(),
    }),
    source: z.string(),
    note: z.string(),
  }),
};
