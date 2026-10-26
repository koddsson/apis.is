import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const SOURCE_URL = "https://her.reykjavik.is/";
const TTL_SECONDS = 60 * 60;
const PAGE_SIZE = 200;

const Rating = z.number().int().min(0).max(5).nullable();

const Inspection = z.object({
  date: z.iso.date(),
  rating: Rating,
  hygiene: Rating,
  food: Rating,
  pollutionControl: Rating,
});
type Inspection = z.infer<typeof Inspection>;

const Business = z.object({
  name: z.string().min(1),
  address: z.string().nullable(),
  postcode: z.string().nullable(),
  town: z.string().nullable(),
  rating: Rating,
  inspections: z.array(Inspection),
});
type Business = z.infer<typeof Business>;

const Results = z.object({
  query: z.string(),
  total: z.number().int(),
  page: z.number().int().min(1),
  pageCount: z.number().int(),
  results: z.array(Business),
});
type Results = z.infer<typeof Results>;

const MONTHS = [
  "janúar",
  "febrúar",
  "mars",
  "apríl",
  "maí",
  "júní",
  "júlí",
  "ágúst",
  "september",
  "október",
  "nóvember",
  "desember",
];

const CATEGORIES: Record<string, keyof Omit<Inspection, "date">> = {
  Hollustuhættir: "hygiene",
  Matvæli: "food",
  Mengunarvarnir: "pollutionControl",
  Heildareinkunn: "rating",
};

// "Á ekki við" (not applicable) and "Ekki skoðað" (not inspected).
const UNRATED = ["Á ekki við", "Ekki skoðað"];

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function rating(value: string): Inspection["rating"] {
  if (/^[0-5]$/.test(value)) return Number(value);
  if (UNRATED.includes(value)) return null;
  throw new Error(`Unknown food inspection rating "${value}"`);
}

// "20. ágúst 2025"
function date(value: string): string {
  const match = /^(\d{1,2})\. (\S+) (\d{4})$/.exec(value);
  const month = MONTHS.indexOf(match?.[2] ?? "") + 1;
  if (!match || month === 0) {
    throw new Error(`Unknown food inspection date "${value}"`);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${match[3]}-${pad(month)}-${pad(Number(match[1]))}`;
}

function inspection(day: string, dl: string): Inspection {
  const result: Inspection = {
    date: date(day),
    rating: null,
    hygiene: null,
    food: null,
    pollutionControl: null,
  };
  for (const [, label, value] of dl.matchAll(
    /<dt>\s*([^<]+?)\s*<[\s\S]*?<dd>\s*([^<]*?)\s*</g,
  )) {
    const key = CATEGORIES[label];
    if (!key) throw new Error(`Unknown food inspection category "${label}"`);
    result[key] = rating(value);
  }
  return result;
}

function business(card: string): Business {
  const name = /<h5 class="card-title">([^<]*)/.exec(card);
  const subtitle = /<h6 class="card-subtitle[^"]*">([\s\S]*?)<\/h6>/.exec(card);
  const header = /<span>([^<]*)<\/span>/.exec(card.split("collapse")[0]);
  if (!name || !subtitle) throw new Error("Unexpected food inspection card");

  let address: string | null = null;
  let postcode: string | null = null;
  let town: string | null = null;
  for (const line of subtitle[1].split("<br>")) {
    const part = text(line).replace(/,$/, "");
    const place = /^(\d{3}) (.+)$/.exec(part);
    if (place) [, postcode, town] = place;
    else if (part) address = part;
  }

  const days = [
    ...card.matchAll(/<strong>[^<]*eftirlit:<\/strong>\s*([^<]+?)\s*</g),
  ];
  const lists = [...card.matchAll(/<dl[^>]*>([\s\S]*?)<\/dl>/g)];
  if (days.length !== lists.length) {
    throw new Error("Food inspection dates and results don't line up");
  }

  return {
    name: text(name[1]),
    address,
    postcode,
    town,
    rating: header ? rating(header[1].trim()) : null,
    inspections: days.map(([, day], i) => inspection(day, lists[i][1])),
  };
}

export function parseResults(html: string, query: string, page: number) {
  const count =
    /fann ([\d.]+) niðurstöð\S*\s*<span class="text-muted">af samtals/.exec(
      html,
    );
  if (!count) throw new Error("Food inspection result count not found");
  const total = Number(count[1].replaceAll(".", ""));

  const cards = html.split(/<div class="card card-inactive\b/).slice(1);
  const results = cards.map((card) => business(card.split("<nav")[0]));
  if (results.length !== Math.min(PAGE_SIZE, total - (page - 1) * PAGE_SIZE)) {
    throw new Error(
      `Expected ${total} food inspection results, found ${results.length}`,
    );
  }
  return {
    query,
    total,
    page,
    pageCount: Math.ceil(total / PAGE_SIZE),
    results,
  };
}

async function fetchResults(
  query: string,
  page: number,
): Promise<Results | null> {
  const url = new URL(SOURCE_URL);
  url.search = new URLSearchParams({
    q: query,
    o: "name",
    page: String(page),
  }).toString();
  const res = await fetch(url, {
    headers: { "User-Agent": "apis.is (+https://apis.is)" },
  });
  // Pages past the last one are a 404.
  if (res.status === 404 && page > 1) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch food inspections: ${res.status}`);
  }
  return parseResults(await res.text(), query, page);
}

async function foodInspections(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const pretty = url.searchParams.get("pretty") === "true";

  let query = "";
  try {
    query = decodeURIComponent(params.query ?? "").trim();
  } catch {}
  if (!query) {
    return response(
      { error: "Search for a business name, kennitala or address" },
      pretty,
      400,
    );
  }

  const pageParam = url.searchParams.get("page") ?? "1";
  if (!/^[1-9]\d*$/.test(pageParam)) {
    return response({ error: `Invalid page ${pageParam}` }, pretty, 400);
  }
  const page = Number(pageParam);

  const data = await withCache(
    `food-inspections-${query.toLowerCase()}-${page}`,
    TTL_SECONDS,
    () => fetchResults(query, page),
  );
  if (!data) {
    return response({ error: `No page ${page} for "${query}"` }, pretty, 404);
  }

  const res = response(data, pretty);
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

foodInspections.meta = {
  endpoint: "/x/food-inspections/{query}",
  description:
    "Search Heilbrigðiseftirlit Reykjavíkur's food and health inspection results by business name or address. Each business has its latest rating and inspection history, graded 0 (operations stopped) to 5 (requirements met), overall and for hygiene, food and pollution control; null where not applicable or not inspected. 200 results per page, with optional ?page=.",
};

foodInspections.health = {
  params: { query: "pizza" },
  schema: Results.extend({
    results: z
      .array(Business)
      .min(1)
      .refine(
        (results) => results.some((result) => result.inspections.length > 0),
        "No business has inspection results",
      ),
  }),
};

export default foodInspections;
