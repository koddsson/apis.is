import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const TTL_SECONDS = 5 * 60;

const AREAS = {
  blafjoll: { name: "Bláfjöll", url: "https://skidasvaedi.is/" },
  skalafell: {
    name: "Skálafell",
    url: "https://skidasvaedi.is/skalafell/svaedi/",
  },
} as const;
type AreaId = keyof typeof AREAS;
const AREA_IDS = Object.keys(AREAS) as AreaId[];

const LIFT_TYPES = [
  "chairlift",
  "surface-lift",
  "rope-tow",
  "carpet",
  "slope",
] as const;
const DIFFICULTIES = ["easy", "intermediate", "difficult"] as const;

const Lift = z.object({
  id: z.string(),
  name: z.string(),
  section: z.string(),
  type: z.enum(LIFT_TYPES).nullable(),
  open: z.boolean(),
  length: z.number().nullable(),
  drop: z.number().nullable(),
  rideTime: z.number().nullable(),
  difficulty: z.enum(DIFFICULTIES).nullable(),
});
type Lift = z.infer<typeof Lift>;

const Trail = z.object({
  name: z.string(),
  open: z.boolean(),
  length: z.number().nullable(),
});
type Trail = z.infer<typeof Trail>;

const Area = z.object({
  area: z.enum(AREA_IDS),
  name: z.string(),
  updated: z.iso.datetime(),
  lifts: z.array(Lift).min(1),
  trails: z.array(Trail),
  notes: z.array(z.string()),
});
type Area = z.infer<typeof Area>;

const TYPES: Record<string, Lift["type"]> = {
  toglyfta: "surface-lift",
  kaðallyfta: "rope-tow",
  færiband: "carpet",
  skíðaleið: "slope",
};

const DIFFICULTY: Record<string, Lift["difficulty"]> = {
  auðvelt: "easy",
  "miðlungs erfitt": "intermediate",
  erfitt: "difficult",
};

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// "1.200m" uses a dot as the thousands separator.
function metres(value: string | undefined): number | null {
  const digits = value?.replace(/[.\s]/g, "").match(/^(\d+)m$/);
  return digits ? Number(digits[1]) : null;
}

function seconds(value: string | undefined): number | null {
  const time = value?.match(/(\d+):(\d\d)/);
  return time ? Number(time[1]) * 60 + Number(time[2]) : null;
}

// "Uppfært: 26/10/26 kl 00:00", in Icelandic local time, which is UTC.
function updated(html: string): string {
  const match = /Uppfært: (\d+)\/(\d+)\/(\d\d) kl (\d\d):(\d\d)/.exec(html);
  if (!match) throw new Error("Ski area update time not found on page");
  const [, day, month, year, hour, minute] = match.map(Number);
  return new Date(
    Date.UTC(2000 + year, month - 1, day, hour, minute),
  ).toISOString();
}

export function parseArea(area: AreaId, html: string): Area {
  const start = html.indexOf('<div class="skidalyftur');
  const end = html.indexOf("Uppfært:", start);
  if (start === -1 || end === -1) {
    throw new Error(`Lift status not found on ${AREAS[area].url}`);
  }
  const widget = html.slice(start, end + 40);

  const lifts: Lift[] = [];
  const trails: Trail[] = [];
  const notes: string[] = [];
  for (const [, section, list] of widget.matchAll(
    /<h4>(.*?)<\/h4>\s*<ul class="list-opnanir">(.*?)<\/ul>/gs,
  )) {
    for (const [, attributes, content] of list.matchAll(
      /<li([^>]*)>(.*?)<\/li>/gs,
    )) {
      const attr = Object.fromEntries(
        Array.from(attributes.matchAll(/([\w-]+)="([^"]*)"/g), (m) => [
          m[1],
          m[2],
        ]),
      );
      const classes = (attr.class ?? "").split(/\s+/);
      if (classes.includes("hidden")) continue;
      const name = text(content);
      // Staff add free-text lines (e.g. "Lokað í dag.") without lift attributes.
      if (!("lengd" in attr)) {
        notes.push(name);
        continue;
      }
      if (!classes.includes("open") && !classes.includes("closed")) {
        throw new Error(`Unexpected lift status: ${attr.class}`);
      }
      const open = classes.includes("open");

      if (/gönguleiðir/i.test(section)) {
        const km = /^(.*?)\s*\((\d+(?:[.,]\d+)?) km\)$/.exec(name);
        trails.push({
          name: km ? km[1] : name,
          open,
          length: km
            ? Math.round(Number(km[2].replace(",", ".")) * 1000)
            : null,
        });
        continue;
      }

      lifts.push({
        id: attr.leid,
        name,
        section: text(section),
        type: /sæta|stólalyfta/i.test(name)
          ? "chairlift"
          : (TYPES[(attr.desc ?? "").toLowerCase()] ?? null),
        open,
        length: metres(attr.lengd),
        drop: metres(attr.fall),
        rideTime: seconds(attr.ferdatimi),
        difficulty:
          DIFFICULTY[(attr.erfidleikastig ?? "").toLowerCase()] ?? null,
      });
    }
  }

  if (lifts.length === 0) {
    throw new Error(`No lifts found on ${AREAS[area].url}`);
  }

  return {
    area,
    name: AREAS[area].name,
    updated: updated(widget),
    lifts,
    trails,
    notes,
  };
}

async function fetchArea(area: AreaId): Promise<Area> {
  const res = await fetch(AREAS[area].url, {
    headers: { "User-Agent": "apis.is (+https://apis.is)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${AREAS[area].name}: ${res.status}`);
  }
  return parseArea(area, await res.text());
}

async function ski(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const area = url.searchParams.get("area");
  if (area && !(AREA_IDS as string[]).includes(area)) {
    return response(
      { error: `area must be one of ${AREA_IDS.join(", ")}` },
      false,
      404,
    );
  }

  const ids = area ? [area as AreaId] : AREA_IDS;
  const data = await Promise.all(
    ids.map((id) => withCache(`ski:${id}`, TTL_SECONDS, () => fetchArea(id))),
  );

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

ski.meta = {
  endpoint: "/x/ski",
  description:
    "Open/closed status of lifts, slopes and cross-country trails at Bláfjöll and Skálafell ski areas, with lift length and vertical drop (m) and ride time (s). Optional ?area= filter (blafjoll, skalafell).",
};

ski.health = { schema: z.array(Area).min(1) };

export default ski;
