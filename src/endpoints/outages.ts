import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const VEITUR_URL = "https://www.veitur.is/bilanir";
// The JSON endpoint behind rarik.is/tilkynningar; CONTENT is rendered HTML.
const RARIK_URL =
  "https://www.rarik.is/AfoCustom/RARIK/Display/RARIK_NOAS2ListingDS.cfc?method=GetAlerts&start=1&DesignStyleCode=27";
const RARIK_MAP_URL = "https://s-rek-arcgis-y1.rarik.is/tilkynning/";
const NORDURORKA_URL =
  "https://www.no.is/is/thjonusta/tilkynningar-um-thjonusturof";
const TTL_SECONDS = 5 * 60;

const TYPES = ["power", "hot-water", "cold-water", "sewage"] as const;
const STATUSES = ["not-started", "in-progress", "finished"] as const;

const Outage = z.object({
  source: z.enum(["Veitur", "RARIK", "Norðurorka"]),
  id: z.string(),
  type: z.enum(TYPES).nullable(),
  status: z.enum(STATUSES).nullable(),
  title: z.string(),
  description: z.string(),
  postcode: z.string().nullable(),
  location: z.string().nullable(),
  start: z.iso.datetime(),
  end: z.iso.datetime().nullable(),
  url: z.string(),
});
type Outage = z.infer<typeof Outage>;

const VEITUR_TYPES: Record<string, Outage["type"]> = {
  rafmagn: "power",
  "heitt vatn": "hot-water",
  "kalt vatn": "cold-water",
  fráveita: "sewage",
};

interface VeiturOutage {
  system: { uid: string };
  heading: string;
  short_description: string;
  classification: string;
  zip: string;
  implementation_date_from: string;
  implementation_date_to: string;
  url: string;
  outages_statusConnection: { edges: Array<{ node: { label: string } }> };
}

// Both utilities label statuses in Icelandic: "Vinna ekki hafin"/"Ekki hafið",
// "Vinna í gangi"/"Í gangi", "Vinnu lokið"/"Lokið".
function status(label: string | undefined): Outage["status"] {
  const value = label?.toLowerCase() ?? "";
  if (value.includes("lokið")) return "finished";
  if (value.includes("gangi")) return "in-progress";
  if (value.includes("ekki hafi")) return "not-started";
  return null;
}

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchVeitur(): Promise<Outage[]> {
  const res = await fetch(VEITUR_URL);
  if (!res.ok) throw new Error(`Failed to fetch Veitur outages: ${res.status}`);
  const data = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s.exec(
    await res.text(),
  );
  if (!data) throw new Error("Veitur outage data not found on page");
  const { hits } = JSON.parse(data[1]).props.pageProps.content as {
    hits: VeiturOutage[];
  };

  return hits.map((outage) => ({
    source: "Veitur",
    id: outage.system.uid,
    type: VEITUR_TYPES[outage.classification.toLowerCase()] ?? null,
    status: status(outage.outages_statusConnection.edges[0]?.node.label),
    title: text(outage.heading),
    description: text(outage.short_description),
    postcode: outage.zip,
    location: null,
    start: new Date(outage.implementation_date_from).toISOString(),
    end: new Date(outage.implementation_date_to).toISOString(),
    url: new URL(outage.url, VEITUR_URL).toString(),
  }));
}

// "26.10.2026 11:37", in Icelandic local time, which is UTC.
function rarikTime(date: string, time: string): string {
  const [day, month, year] = date.split(".");
  return new Date(`${year}-${month}-${day}T${time}:00Z`).toISOString();
}

function rarikType(title: string): Outage["type"] {
  if (/heitavatn|hitaveit/i.test(title)) return "hot-water";
  if (/kaldavatn|kalt vatn|vatnsveit/i.test(title)) return "cold-water";
  return "power";
}

export function parseRarik(html: string): Outage[] {
  return html
    .split(/<hr[^>]*rarOAlertsListing-divider[^>]*>/)
    .filter((row) => row.includes("rarOAlertsListing-title"))
    .map((row) => {
      // Earlier updates to the same outage are nested after the latest one.
      const latest = row.split("rarOAlertsListing-childrenWrap")[0];
      const field = (name: string) =>
        text(
          new RegExp(`rarOAlertsListing-${name}[^>]*>(.*?)</div>`, "s").exec(
            latest,
          )?.[1] ?? "",
        );

      const id = /ANNOUNCEMENT_ID=(\d+)/.exec(latest);
      const span =
        /(\d\d\.\d\d\.\d{4}) (\d\d:\d\d) til (?:(\d\d\.\d\d\.\d{4}) )?(\d\d:\d\d)/.exec(
          field("timespan"),
        );
      if (!id || !span) throw new Error(`Unexpected RARIK alert: ${latest}`);

      const title = field("title");
      return {
        source: "RARIK",
        id: id[1],
        type: rarikType(title),
        status: status(field("status")),
        title,
        description: field("message"),
        postcode: null,
        location: null,
        start: rarikTime(span[1], span[2]),
        end: rarikTime(span[3] ?? span[1], span[4]),
        url: `${RARIK_MAP_URL}?ANNOUNCEMENT_ID=${id[1]}`,
      };
    });
}

async function fetchRarik(): Promise<Outage[]> {
  // RARIK answers requests without a User-Agent with an empty body.
  const res = await fetch(RARIK_URL, {
    headers: { "User-Agent": "apis.is (+https://apis.is)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch RARIK outages: ${res.status}`);
  const data = await res.json<{ CONTENT: string; TOTAL: number }>();
  const outages = parseRarik(data.CONTENT);
  if (data.TOTAL > 0 && outages.length === 0) {
    throw new Error("RARIK outages not found in response");
  }
  return outages;
}

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
const NUMERIC_DATE = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/g;
const NAMED_DATE = new RegExp(`(\\d{1,2})\\.\\s*(${MONTHS.join("|")})`, "gi");
const TIME =
  /(?:kl(?:ukkan|\.|:)?\s*(\d{1,2})(?:[:.](\d{2}))?|(\d{1,2})[:.](\d{2}))/gi;

// Dates without a year ("5. september") are taken as the closest one to now.
function closestYear(month: number, day: number): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  return [year - 1, year, year + 1].reduce((best, candidate) =>
    Math.abs(Date.UTC(candidate, month, day) - now.getTime()) <
    Math.abs(Date.UTC(best, month, day) - now.getTime())
      ? candidate
      : best,
  );
}

function dates(value: string): Date[] {
  const numeric = [...value.matchAll(NUMERIC_DATE)].map((match) => {
    const year = Number(match[3]);
    return {
      index: match.index,
      date: Date.UTC(
        year < 100 ? 2000 + year : year,
        Number(match[2]) - 1,
        Number(match[1]),
      ),
    };
  });
  const named = [...value.matchAll(NAMED_DATE)].map((match) => {
    const month = MONTHS.indexOf(match[2].toLowerCase());
    const day = Number(match[1]);
    return {
      index: match.index,
      date: Date.UTC(closestYear(month, day), month, day),
    };
  });
  return [...numeric, ...named]
    .sort((a, b) => a.index - b.index)
    .map(({ date }) => new Date(date));
}

function times(value: string): Array<[number, number]> {
  const stripped = value.replace(NUMERIC_DATE, " ").replace(NAMED_DATE, " ");
  return [...stripped.matchAll(TIME)]
    .map(([, h1, m1, h2, m2]): [number, number] => [
      Number(h1 ?? h2),
      Number(m1 ?? m2 ?? 0),
    ])
    .filter(([hours, minutes]) => hours < 24 && minutes < 60);
}

function at(date: Date, [hours, minutes]: [number, number]): Date {
  return new Date(date.getTime() + (hours * 60 + minutes) * 60_000);
}

function nordurorkaType(value: string): Outage["type"] {
  if (/fráveit/i.test(value)) return "sewage";
  if (/hitaveit|heit[ta]/i.test(value)) return "hot-water";
  if (/kald|kalt vatn|vatnsveit/i.test(value)) return "cold-water";
  if (/straum|rafmagn/i.test(value)) return "power";
  return null;
}

export function parseNordurorka(html: string): Outage[] {
  if (!html.includes("<h1>Tilkynningar um þjónusturof</h1>")) {
    throw new Error("Norðurorka outage list not found on page");
  }
  return html
    .split('<div class="item ')
    .slice(1)
    .flatMap((item) => {
      const field = (pattern: string) =>
        text(new RegExp(pattern, "s").exec(item)?.[1] ?? "");
      const id = item.slice(0, item.search(/[ "]/));
      const title = field("<h2>(.*?)</h2>");
      const description = field(
        '<div class="description">(.*?)(?:<div class="interuption__button">|</div>)',
      );
      const location = field('<div class="where">(.*?)</div>');
      const when = field('<div class="when">(.*?)</div>');

      const [day, endDay] = [
        ...dates(when),
        ...dates(title),
        ...dates(description),
      ];
      if (!day) return [];
      const [startTime, endTime] = times(when);
      const start = startTime ? at(day, startTime) : day;
      let end = endTime ? at(endDay ?? day, endTime) : null;
      if (end && end <= start) end = new Date(end.getTime() + 86_400_000);

      return [
        {
          source: "Norðurorka" as const,
          id,
          type: nordurorkaType(`${title} ${description}`),
          status: null,
          title,
          description,
          postcode: null,
          location: location || null,
          start: start.toISOString(),
          end: end?.toISOString() ?? null,
          url: `${NORDURORKA_URL}/${id}`,
        },
      ];
    });
}

async function fetchNordurorka(): Promise<Outage[]> {
  const res = await fetch(NORDURORKA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Norðurorka outages: ${res.status}`);
  }
  return parseNordurorka(await res.text());
}

async function fetchOutages(): Promise<Outage[]> {
  const sources = await Promise.all([
    fetchVeitur(),
    fetchRarik(),
    fetchNordurorka(),
  ]);
  return sources.flat().sort((a, b) => b.start.localeCompare(a.start));
}

async function outages(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const state = url.searchParams.get("status");
  if (type && !(TYPES as readonly string[]).includes(type)) {
    return response(
      { error: `type must be one of ${TYPES.join(", ")}` },
      false,
      400,
    );
  }
  if (state && !(STATUSES as readonly string[]).includes(state)) {
    return response(
      { error: `status must be one of ${STATUSES.join(", ")}` },
      false,
      400,
    );
  }

  const all = await withCache("outages", TTL_SECONDS, fetchOutages);
  const data = all.filter(
    (outage) =>
      (!type || outage.type === type) && (!state || outage.status === state),
  );

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

outages.meta = {
  endpoint: "/x/outages",
  description:
    "Recent and planned power, hot water, cold water and sewage outages from Veitur (capital area), RARIK (most of rural Iceland) and Norðurorka (Akureyri), newest first. Optional ?type= (power, hot-water, cold-water, sewage) and ?status= (not-started, in-progress, finished) filters.",
};

outages.health = { schema: z.array(Outage).min(1) };

export default outages;
