import { XMLParser } from "fast-xml-parser";
import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const XML_URL = "https://www.althingi.is/altext/xml/";
const TTL_SECONDS = 30 * 60;
const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/;

const Item = z.object({
  number: z.number().int(),
  issue: z.object({
    number: z.number().int(),
    category: z.enum(["A", "B"]),
    name: z.string(),
    description: z.string().nullable(),
    type: z.string(),
    typeCode: z.string(),
    url: z.url(),
  }),
  debate: z.string().nullable(),
  speaker: z.string().nullable(),
  respondent: z.string().nullable(),
  note: z.string().nullable(),
});
type Item = z.infer<typeof Item>;

const Agenda = z.object({
  session: z.number().int(),
  meeting: z.number().int(),
  name: z.string(),
  time: z.iso.datetime().nullable(),
  timeText: z.string(),
  start: z.iso.datetime().nullable(),
  end: z.iso.datetime().nullable(),
  items: z.array(Item),
});
type Agenda = z.infer<typeof Agenda>;

type Text = string | { "#text"?: string };

interface UpstreamItem {
  "@_númer": string;
  mál: {
    "@_málsnúmer": string;
    "@_málsflokkur": "A" | "B";
    málsheiti: string;
    efnisgreining?: string;
    málstegund: { "#text": string; "@_id": string };
    fyrirspyrjandi?: Text;
    málshefjandi?: Text;
    til_svara?: Text;
    til_andsvara?: Text;
  };
  umræða: Text;
  athugasemd?: { skýring: string };
}

interface UpstreamMeeting {
  "@_númer": string;
  "@_þingnúmer": string;
  fundarheiti: string;
  hefst: { texti: string; dagurtími?: string };
  fundursettur?: string;
  fuslit?: string;
  dagskrá: { dagskrárliður: UpstreamItem[] } | "";
}

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  isArray: (name) => name === "dagskrárliður",
});

function text(value: Text | undefined): string | null {
  const raw = typeof value === "object" ? value["#text"] : value;
  return raw?.trim() || null;
}

function time(value: string | undefined, meeting: string): string | null {
  if (value === undefined) return null;
  if (!TIME.test(value)) {
    throw new Error(`Unexpected time "${value}" on meeting ${meeting}`);
  }
  // Alþingi times are Icelandic local time, which is UTC all year.
  return `${value}Z`;
}

function toItem(item: UpstreamItem, session: string): Item {
  const { mál } = item;
  const number = mál["@_málsnúmer"];
  const path = mál["@_málsflokkur"] === "A" ? "ferill" : "bferill";
  return {
    number: Number(item["@_númer"]),
    issue: {
      number: Number(number),
      category: mál["@_málsflokkur"],
      name: mál.málsheiti,
      description: text(mál.efnisgreining),
      type: mál.málstegund["#text"],
      typeCode: mál.málstegund["@_id"],
      url: `https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/${path}/?ltg=${session}&mnr=${number}`,
    },
    debate: text(item.umræða),
    speaker: text(mál.fyrirspyrjandi) ?? text(mál.málshefjandi),
    respondent: text(mál.til_svara) ?? text(mál.til_andsvara),
    note: item.athugasemd?.skýring.trim() || null,
  };
}

function toAgenda(meeting: UpstreamMeeting): Agenda {
  const number = meeting["@_númer"];
  const session = meeting["@_þingnúmer"];
  const items = meeting.dagskrá ? meeting.dagskrá.dagskrárliður : [];
  return {
    session: Number(session),
    meeting: Number(number),
    name: meeting.fundarheiti,
    time: time(meeting.hefst.dagurtími, number),
    timeText: meeting.hefst.texti.trim(),
    start: time(meeting.fundursettur, number),
    end: time(meeting.fuslit, number),
    items: items.map((item) => toItem(item, session)),
  };
}

async function fetchXml(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return parser.parse(await res.text());
}

async function fetchSession(): Promise<number> {
  const json = (await fetchXml(`${XML_URL}loggjafarthing/yfirstandandi/`)) as {
    löggjafarþing?: { þing?: { "@_númer": string } };
  };
  const session = json.löggjafarþing?.þing?.["@_númer"];
  if (!session) throw new Error("Current Alþingi session not found");
  return Number(session);
}

async function fetchAgenda(meeting?: number): Promise<Agenda | null> {
  let url = `${XML_URL}dagskra/thingfundur/`;
  if (meeting !== undefined) {
    const session = await withCache(
      "althingi-session",
      TTL_SECONDS,
      fetchSession,
    );
    url += `?lthing=${session}&fundur=${meeting}`;
  }
  const json = (await fetchXml(url)) as {
    dagskráþingfundar?: { þingfundur: UpstreamMeeting } | "";
  };
  if (json.dagskráþingfundar === undefined) {
    throw new Error("Alþingi agenda not found in response");
  }
  return json.dagskráþingfundar
    ? toAgenda(json.dagskráþingfundar.þingfundur)
    : null;
}

async function althingiAgenda(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const meetingParam = url.searchParams.get("meeting");
  if (meetingParam !== null && !/^[1-9]\d*$/.test(meetingParam)) {
    return response({ error: "meeting must be a number" }, false, 400);
  }
  const meeting = meetingParam === null ? undefined : Number(meetingParam);

  const agenda = await withCache(
    `althingi-agenda:${meeting ?? "next"}`,
    TTL_SECONDS,
    () => fetchAgenda(meeting),
  );
  if (!agenda && meeting !== undefined) {
    return response({ error: `Unknown meeting ${meeting}` }, false, 404);
  }

  const res = response(agenda, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

althingiAgenda.meta = {
  endpoint: "/x/althingi/agenda",
  description:
    "Agenda of Alþingi's next sitting, or null when none is scheduled. Optional ?meeting= number for a meeting of the current session. Each item has the issue, the debate stage and, for questions and special debates, who asks and who answers.",
};

// null between sittings, when Alþingi has no agenda published.
althingiAgenda.health = { schema: Agenda.nullable() };

export default althingiAgenda;
