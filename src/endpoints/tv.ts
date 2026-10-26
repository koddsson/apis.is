import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const RUV_URL = "https://api.ruv.is/api/schedule";
const SYN_URL = "https://www.syn.is/api/epg";
const RUV_CHANNELS = { ruv: "RÚV", ruv2: "RÚV 2" };
// Full schedules for Sýn's main channels; "beint" adds live events on the rest.
const SYN_FEEDS = ["syn", "synsport", "beint"];
const TTL_SECONDS = 15 * 60;
// RÚV only serves schedules up to 42 days either side of today.
const MAX_DAYS = 42;

const Program = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  live: z.boolean(),
  episode: z.number().nullable(),
  episodes: z.number().nullable(),
});
type Program = z.infer<typeof Program>;

const Channel = z.object({
  id: z.string(),
  name: z.string(),
  broadcaster: z.enum(["RÚV", "Sýn"]),
  programs: z.array(Program).min(1),
});
type Channel = z.infer<typeof Channel>;

interface RuvEvent {
  title: string;
  original_title: string | null;
  description: Array<string | null> | null;
  start_time: string;
  end_time: string;
  episode_number: number | null;
  number_of_episodes: number | null;
  is_header: boolean;
  is_subevent: boolean;
  is_live: boolean;
}

interface SynProgram {
  midill: string;
  midill_heiti: string;
  dagsetning: string;
  upphaf: string;
  titill: string;
  isltitill: string;
  thattur: number;
  thattafjoldi: number;
  birta_thatt: number;
  beint: number;
  flokkur: string | null;
  lysing: string | null;
  slott: number;
}

// RÚV gives local times without an offset; Iceland is on UTC year-round.
function ruvTime(time: string): string {
  return new Date(`${time.slice(0, 19)}Z`).toISOString();
}

async function fetchRuv(id: string, date: string): Promise<Program[]> {
  const res = await fetch(`${RUV_URL}/${id}/${date}`);
  if (!res.ok) throw new Error(`Failed to fetch RÚV schedule: ${res.status}`);
  const { events } = await res.json<{ events?: RuvEvent[] }>();
  if (!Array.isArray(events)) throw new Error("RÚV schedule has no events");

  return events
    .filter((event) => !event.is_header && !event.is_subevent)
    .map((event) => ({
      title: event.title,
      subtitle: event.original_title,
      description: (event.description ?? []).filter(Boolean).join("\n") || null,
      category: null,
      start: ruvTime(event.start_time),
      end: ruvTime(event.end_time),
      live: event.is_live,
      episode: event.episode_number,
      episodes: event.number_of_episodes,
    }));
}

async function fetchSyn(feed: string, date: string): Promise<SynProgram[]> {
  const res = await fetch(`${SYN_URL}/${feed}/${date}`);
  if (!res.ok) throw new Error(`Failed to fetch Sýn ${feed}: ${res.status}`);
  const programs = await res.json<SynProgram[]>();
  if (!Array.isArray(programs)) {
    throw new Error(`Unexpected Sýn ${feed} response`);
  }
  // Each feed lists the requested day and the days after it.
  return programs.filter((program) => program.dagsetning.startsWith(date));
}

function synChannelId(code: string): string {
  const kki = /^AP_KKITV_(\d+)_PROD$/.exec(code);
  return kki ? `kkitv${Number(kki[1])}` : code.toLowerCase();
}

function synProgram(program: SynProgram): Program {
  const start = new Date(program.upphaf);
  const title = program.isltitill.trim();
  const subtitle = program.titill.trim();
  const numbered = program.birta_thatt === 1 && program.thattur > 0;
  return {
    title,
    subtitle: subtitle && subtitle !== title ? subtitle : null,
    description: program.lysing?.trim() || null,
    category: program.flokkur || null,
    start: start.toISOString(),
    end: new Date(start.getTime() + program.slott * 60_000).toISOString(),
    live: program.beint === 1,
    episode: numbered ? program.thattur : null,
    episodes:
      numbered && program.thattafjoldi > 0 ? program.thattafjoldi : null,
  };
}

async function fetchSchedule(date: string): Promise<Channel[]> {
  const [ruv, syn] = await Promise.all([
    Promise.all(
      Object.entries(RUV_CHANNELS).map(async ([id, name]) => ({
        id,
        name,
        broadcaster: "RÚV" as const,
        programs: await fetchRuv(id, date),
      })),
    ),
    Promise.all(SYN_FEEDS.map((feed) => fetchSyn(feed, date))),
  ]);

  const synChannels = new Map<string, Channel>();
  const seen = new Set<string>();
  for (const program of syn.flat()) {
    const key = `${program.midill} ${program.upphaf}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = synChannelId(program.midill);
    const channel = synChannels.get(id) ?? {
      id,
      name: program.midill_heiti,
      broadcaster: "Sýn" as const,
      programs: [],
    };
    channel.programs.push(synProgram(program));
    synChannels.set(id, channel);
  }

  return [...ruv, ...synChannels.values()]
    .filter((channel) => channel.programs.length > 0)
    .map((channel) => ({
      ...channel,
      programs: channel.programs.sort((a, b) => a.start.localeCompare(b.start)),
    }));
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().startsWith(value) ? date : null;
}

async function tv(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const date = url.searchParams.get("date") ?? today;
  const day = parseDate(date);
  if (!day) {
    return response({ error: "date must be YYYY-MM-DD" }, false, 400);
  }
  const offset = (day.getTime() - Date.parse(today)) / 86_400_000;
  if (Math.abs(offset) > MAX_DAYS) {
    return response(
      { error: `date must be within ${MAX_DAYS} days of today` },
      false,
      400,
    );
  }

  const channels = await withCache(`tv:${date}`, TTL_SECONDS, () =>
    fetchSchedule(date),
  );

  const id = url.searchParams.get("channel")?.toLowerCase();
  const data = id ? channels.filter((channel) => channel.id === id) : channels;
  if (id && data.length === 0) {
    return response(
      { error: `No schedule for channel ${id} on ${date}` },
      false,
      404,
    );
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

tv.meta = {
  endpoint: "/x/tv",
  description:
    "TV schedule for a day (Icelandic time, which is UTC): full listings for RÚV, RÚV 2, Sýn and Sýn Sport, plus live sports on Sýn's other sports channels and KKÍ TV. Optional ?channel= id (e.g. ruv, syn, synsport) and ?date=YYYY-MM-DD (up to 42 days either side of today; defaults to today).",
};

tv.health = { schema: z.array(Channel).min(1) };

export default tv;
