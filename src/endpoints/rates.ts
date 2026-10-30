import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { type Entry, fetchGroup, series } from "../sedlabanki.ts";
import { response } from "../utils.ts";

const TTL_SECONDS = 3 * 60 * 60;
// Rates can hold for over a year, so look back far enough to find the last change.
const HISTORY_DAYS = 2 * 365;
// Covers weekends and holidays, when no interbank rates are fixed.
const INTERBANK_DAYS = 14;

const CENTRAL_BANK = [
  {
    id: "policy-rate",
    series: "17923",
    name: "Policy rate (7-day term deposits)",
  },
  {
    id: "collateralised-lending",
    series: "55",
    name: "7-day collateralised lending",
  },
  { id: "overnight-lending", series: "24", name: "Overnight lending" },
  { id: "current-account", series: "28", name: "Current accounts" },
];

const INTERBANK = [
  { term: "overnight", reibor: "12", reibid: "3" },
  { term: "tomorrow-next", reibor: "3171", reibid: "3170" },
  { term: "1-week", reibor: "17", reibid: "8" },
  { term: "2-weeks", reibor: "20", reibid: "11" },
  { term: "1-month", reibor: "13", reibid: "4" },
  { term: "2-months", reibor: "14", reibid: "5" },
  { term: "3-months", reibor: "15", reibid: "6" },
  { term: "6-months", reibor: "16", reibid: "7" },
];

const Rate = z.object({
  rate: z.number(),
  since: z.iso.date().nullable(),
});

const Rates = z.object({
  centralBank: z.array(Rate.extend({ id: z.string(), name: z.string() })),
  penaltyInterest: Rate,
  interbank: z.object({
    date: z.iso.date(),
    terms: z.array(
      z.object({ term: z.string(), reibor: z.number(), reibid: z.number() }),
    ),
  }),
  source: z.string(),
});
type Rates = z.infer<typeof Rates>;

export function current(entries: [Entry, ...Entry[]]) {
  const latest = entries[entries.length - 1];
  let i = entries.length - 1;
  while (i > 0 && entries[i - 1].value === latest.value) i--;
  // Unchanged for the whole history fetched, so the start date is unknown.
  return { rate: latest.value, since: i > 0 ? entries[i].date : null };
}

async function fetchRates(): Promise<Rates> {
  const [centralBank, penalty, interbank] = await Promise.all([
    fetchGroup(1, HISTORY_DAYS),
    fetchGroup(2, HISTORY_DAYS),
    fetchGroup(4, INTERBANK_DAYS),
  ]);
  const last = (id: string) => series(interbank, id).at(-1) as Entry;

  return {
    centralBank: CENTRAL_BANK.map(({ id, series: seriesId, name }) => ({
      id,
      name,
      ...current(series(centralBank, seriesId)),
    })),
    penaltyInterest: current(series(penalty, "22")),
    interbank: {
      date: last(INTERBANK[0].reibor).date,
      terms: INTERBANK.map(({ term, reibor, reibid }) => ({
        term,
        reibor: last(reibor).value,
        reibid: last(reibid).value,
      })),
    },
    source: "Seðlabanki Íslands",
  };
}

async function rates(request: Request): Promise<Response> {
  const data = await withCache("rates", TTL_SECONDS, fetchRates);
  const res = response(
    data,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

rates.meta = {
  endpoint: "/x/rates",
  description:
    "Interest rates from Seðlabanki Íslands: the policy rate and other central bank rates with the date each took effect, penalty interest (dráttarvextir), and the latest REIBOR and REIBID interbank rates by term.",
};

rates.health = {
  schema: Rates.extend({
    centralBank: Rates.shape.centralBank.length(CENTRAL_BANK.length),
    interbank: Rates.shape.interbank.extend({
      terms: Rates.shape.interbank.shape.terms.length(INTERBANK.length),
    }),
  }),
};

export default rates;
