import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const SOURCE_URL = "https://www.vedur.is/hafis/tilkynningar";
const FIRST_YEAR = 2011;
const TTL_SECONDS = 30 * 60;

const OBSERVATIONS: Record<string, string> = {
  "Byggt á gervitunglamynd": "satellite",
  Skip: "ship",
  Flug: "aircraft",
  "Flug Landhelgisgæslunnar": "coast-guard-aircraft",
  "Athugun frá landi": "land",
  "Óskilgreind tegund athugunar": "unspecified",
};

const MONTHS = [
  "jan.",
  "feb.",
  "mar.",
  "apr.",
  "maí",
  "jún.",
  "júl.",
  "ágú.",
  "sep.",
  "okt.",
  "nóv.",
  "des.",
];

const Position = z.object({
  text: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
type Position = z.infer<typeof Position>;

const Notice = z.object({
  time: z.iso.datetime(),
  observation: z.enum(Object.values(OBSERVATIONS)),
  text: z.string(),
  isolatedIce: z.array(Position),
  iceEdge: z.array(Position),
  images: z.array(z.object({ url: z.url(), caption: z.string().nullable() })),
});
type Notice = z.infer<typeof Notice>;

function text(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// "19. okt. 2026 12:56", in Icelandic local time, which is UTC.
function time(value: string): string {
  const match = /^(\d{1,2})\. (\S+) (\d{4}) (\d\d):(\d\d)$/.exec(value);
  const month = MONTHS.indexOf(match?.[2] ?? "");
  if (!match || month === -1) throw new Error(`Unexpected time: ${value}`);
  const [, day, , year, hour, minute] = match.map(Number);
  return new Date(Date.UTC(year, month, day, hour, minute)).toISOString();
}

const COMPONENT = String.raw`\d+(?:[.,]\d+)?(?:\s*[:°]\s*\d+(?:[.,]\d+)?){0,2}\s*['´]?`;
const POSITION = new RegExp(
  String.raw`^(${COMPONENT})\s*N\s*[,-]?\s*(${COMPONENT})\s*[WV]?$`,
  "i",
);

function degrees(value: string): number | null {
  const [deg, min = 0, sec = 0] = value
    .replace(/['´\s]/g, "")
    .split(/[:°]/)
    .map((part) => Number(part.replace(",", ".")));
  if (min >= 60 || sec >= 60) return null;
  return Math.round((deg + min / 60 + sec / 3600) * 1e5) / 1e5;
}

// Typed by hand: "65:57.8N, 023:50.6W", "66°00N, 026°16V", "67.15N, 22.2W"…
function position(raw: string): Position {
  const value = text(raw);
  const match = POSITION.exec(value);
  const latitude = match ? degrees(match[1]) : null;
  const longitude = match ? degrees(match[2]) : null;
  if (latitude === null || longitude === null) {
    return { text: value, latitude: null, longitude: null };
  }
  // All reports are north-west of Iceland, and some leave out the "W".
  return { text: value, latitude, longitude: -longitude };
}

function positions(html: string, heading: string): Position[] {
  const list = new RegExp(
    `class="${heading}">[^<]*</h3>\\s*<ul>(.*?)</ul>`,
    "s",
  ).exec(html)?.[1];
  return [...(list ?? "").matchAll(/<li>(.*?)<\/li>/gs)]
    .map((item) => position(item[1]))
    .filter((item) => item.text !== "");
}

function parseNotices(html: string): Notice[] {
  if (!html.includes("<h1>Hafístilkynningar")) {
    throw new Error("Sea ice notices not found on page");
  }

  return html
    .split('<div class="textforec">')
    .slice(1)
    .map((block) => {
      const notice = block.split("<script")[0];
      const heading = /^<h2>(.*?) - (.*?)<\/h2>(.*?)(?:<h3|<\/div>)/s.exec(
        notice,
      );
      const observation = heading && OBSERVATIONS[heading[2]];
      if (!heading || !observation) {
        throw new Error(`Unexpected sea ice notice: ${notice.slice(0, 200)}`);
      }

      return {
        time: time(heading[1]),
        observation,
        text: text(heading[3]),
        isolatedIce: positions(notice, "s_ice_head"),
        iceEdge: positions(notice, "e_ice_head"),
        images: [
          ...notice.matchAll(
            /<a class="seaice_gal[^>]*title="([^"]*)" href="([^"]*)"/g,
          ),
        ].map(([, caption, href]) => ({
          url: new URL(href, SOURCE_URL).toString(),
          caption: caption || null,
        })),
      };
    });
}

async function fetchNotices(year: string | null): Promise<Notice[]> {
  const url = year ? `${SOURCE_URL}?year=${year}` : SOURCE_URL;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Failed to fetch sea ice notices: ${res.status}`);
  return parseNotices(await res.text());
}

async function seaIce(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const year = url.searchParams.get("year");
  if (year !== null && !/^\d{4}$/.test(year)) {
    return response({ error: "year must be a four-digit year" }, false, 400);
  }
  const currentYear = new Date().getUTCFullYear();
  if (year && (Number(year) < FIRST_YEAR || Number(year) > currentYear)) {
    return response(
      { error: `Notices are available for ${FIRST_YEAR}-${currentYear}` },
      false,
      404,
    );
  }

  const data = await withCache(`sea-ice:${year ?? "recent"}`, TTL_SECONDS, () =>
    fetchNotices(year),
  );

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

seaIce.meta = {
  endpoint: "/x/sea-ice",
  description:
    "Sea ice and iceberg notices from Veðurstofa Íslands, newest first: time, observation type (satellite, ship, aircraft, coast-guard-aircraft, land, unspecified), the Icelandic notice text, reported positions of isolated ice (icebergs, floes) and the ice edge, and map images. Last 30 days by default, or a whole year with ?year= (2011 onwards).",
};

seaIce.health = { schema: z.array(Notice) };

export default seaIce;
