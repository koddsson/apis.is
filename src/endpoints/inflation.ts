import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { fetchGroup, series } from "../sedlabanki.ts";
import { response } from "../utils.ts";

const TTL_SECONDS = 12 * 60 * 60;
const MAX_MONTHS = 120;
const NOTE =
  "Consumer price index (May 1988 = 100) from Hagstofa Íslands, published monthly. Inflation is the 12-month change in the index, in percent.";

const Month = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  index: z.number(),
  inflation: z.number().nullable(),
});
type Month = z.infer<typeof Month>;

async function fetchMonths(): Promise<Month[]> {
  const groups = await fetchGroup(3, (MAX_MONTHS + 1) * 31);
  const inflation = new Map(
    series(groups, "2").map(({ date, value }) => [date, value]),
  );
  return series(groups, "1").map(({ date, value }) => ({
    month: date.slice(0, 7),
    index: value,
    inflation: inflation.get(date) ?? null,
  }));
}

async function inflation(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requested = url.searchParams.get("months") ?? "12";
  const count = Number(requested);
  if (!/^\d+$/.test(requested) || count < 1 || count > MAX_MONTHS) {
    return response(
      { error: `months must be a whole number from 1 to ${MAX_MONTHS}` },
      false,
      400,
    );
  }

  const months = await withCache("inflation", TTL_SECONDS, fetchMonths);
  const res = response(
    {
      latest: months.at(-1),
      months: months.slice(-count),
      source: "Seðlabanki Íslands, from Hagstofa Íslands' consumer price index",
      note: NOTE,
    },
    url.searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

inflation.meta = {
  endpoint: "/x/inflation",
  description:
    "Iceland's inflation rate (12-month change in the consumer price index) and the index itself, by month (latest ?months=, default 12, up to 120).",
};

inflation.health = {
  schema: z.object({
    latest: Month.extend({ inflation: z.number() }),
    months: z.array(Month).length(12),
    source: z.string(),
    note: z.string(),
  }),
};

export default inflation;
