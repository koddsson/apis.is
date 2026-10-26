import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const VEITUR_URL = "https://www.veitur.is/bilanir";
// The JSON endpoint behind rarik.is/tilkynningar; CONTENT is rendered HTML.
const RARIK_URL =
  "https://www.rarik.is/AfoCustom/RARIK/Display/RARIK_NOAS2ListingDS.cfc?method=GetAlerts&start=1&DesignStyleCode=27";
const RARIK_MAP_URL = "https://s-rek-arcgis-y1.rarik.is/tilkynning/";
const TTL_SECONDS = 5 * 60;

const TYPES = ["power", "hot-water", "cold-water", "sewage"] as const;
const STATUSES = ["not-started", "in-progress", "finished"] as const;

const Outage = z.object({
  source: z.enum(["Veitur", "RARIK"]),
  id: z.string(),
  type: z.enum(TYPES).nullable(),
  status: z.enum(STATUSES).nullable(),
  title: z.string(),
  description: z.string(),
  postcode: z.string().nullable(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
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

async function fetchOutages(): Promise<Outage[]> {
  const sources = await Promise.all([fetchVeitur(), fetchRarik()]);
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
    "Recent and planned power, hot water, cold water and sewage outages from Veitur (capital area) and RARIK (most of rural Iceland), newest first. Optional ?type= (power, hot-water, cold-water, sewage) and ?status= (not-started, in-progress, finished) filters.",
};

outages.health = { schema: z.array(Outage).min(1) };

export default outages;
