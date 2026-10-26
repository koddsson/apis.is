import { XMLParser } from "fast-xml-parser";
import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const VOTES_URL = "https://www.althingi.is/altext/xml/atkvaedagreidslur/";
const TTL_SECONDS = 30 * 60;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

const METHODS: Record<string, "electronic" | "rollCall" | "declaration"> = {
  atkvæðagreiðslukerfi: "electronic",
  nafnakall: "rollCall",
  "yfirlýsing forseta/mál gengur": "declaration",
};

const RESULTS: Record<string, "passed" | "rejected"> = {
  samþykkt: "passed",
  fellt: "rejected",
};

const Vote = z.object({
  id: z.number().int(),
  session: z.number().int(),
  meeting: z.number().int(),
  time: z.iso.datetime(),
  issue: z.object({
    number: z.number().int(),
    category: z.enum(["A", "B"]),
    name: z.string(),
    url: z.url(),
  }),
  document: z.number().int().nullable(),
  type: z.string(),
  typeCode: z.string(),
  item: z.string().nullable(),
  referredTo: z.string().nullable(),
  method: z.enum(["electronic", "rollCall", "declaration"]),
  yes: z.number().int().nullable(),
  no: z.number().int().nullable(),
  abstained: z.number().int().nullable(),
  result: z.enum(["passed", "rejected"]).nullable(),
  url: z.url().nullable(),
});
type Vote = z.infer<typeof Vote>;

interface Count {
  fjöldi: string;
}

interface UpstreamVote {
  "@_atkvæðagreiðslunúmer": string;
  "@_þingnúmer": string;
  "@_málsnúmer": string;
  "@_málsflokkur": "A" | "B";
  mál: { málsheiti: string; html: string };
  tími: string;
  fundur: string;
  tegund: { "#text": string; "@_tegund": string };
  þingskjal?: { "@_skjalsnúmer": string };
  til?: string;
  nánar?: Array<string | { html: string }>;
  samantekt: {
    aðferð: string;
    já?: Count;
    nei?: Count;
    greiðirekkiatkvæði?: Count;
    afgreiðsla?: string;
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  isArray: (name) => name === "atkvæðagreiðsla" || name === "nánar",
});

function count(value: Count | undefined): number | null {
  return value ? Number(value.fjöldi) : null;
}

function toVote(vote: UpstreamVote): Vote {
  const id = vote["@_atkvæðagreiðslunúmer"];
  const { aðferð, afgreiðsla } = vote.samantekt;
  const method = METHODS[aðferð];
  if (!method) throw new Error(`Unknown method "${aðferð}" on vote ${id}`);
  const result = afgreiðsla ? RESULTS[afgreiðsla.toLowerCase()] : null;
  if (result === undefined) {
    throw new Error(`Unknown result "${afgreiðsla}" on vote ${id}`);
  }
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(vote.tími)) {
    throw new Error(`Unexpected time "${vote.tími}" on vote ${id}`);
  }

  const nánar = vote.nánar ?? [];
  const item = nánar.find((entry) => typeof entry === "string")?.trim();
  const details = nánar.find((entry) => typeof entry !== "string");
  const document = vote.þingskjal?.["@_skjalsnúmer"];

  return {
    id: Number(id),
    session: Number(vote["@_þingnúmer"]),
    meeting: Number(vote.fundur),
    // Alþingi times are Icelandic local time, which is UTC all year.
    time: `${vote.tími}Z`,
    issue: {
      number: Number(vote["@_málsnúmer"]),
      category: vote["@_málsflokkur"],
      name: vote.mál.málsheiti,
      url: vote.mál.html,
    },
    document: document ? Number(document) : null,
    type: vote.tegund["#text"],
    typeCode: vote.tegund["@_tegund"],
    item: item || null,
    referredTo: vote.til ?? null,
    method,
    yes: count(vote.samantekt.já),
    no: count(vote.samantekt.nei),
    abstained: count(vote.samantekt.greiðirekkiatkvæði),
    result,
    url: details?.html ?? null,
  };
}

async function fetchVotes(days: number): Promise<Vote[]> {
  const res = await fetch(`${VOTES_URL}?dagar=${days}`);
  if (!res.ok) throw new Error(`Failed to fetch Alþingi votes: ${res.status}`);
  const json = parser.parse(await res.text()) as {
    atkvæðagreiðslur?: { atkvæðagreiðsla: UpstreamVote[] } | "";
  };
  if (json.atkvæðagreiðslur === undefined) {
    throw new Error("Alþingi votes not found in response");
  }
  const votes = json.atkvæðagreiðslur
    ? json.atkvæðagreiðslur.atkvæðagreiðsla
    : [];
  return votes
    .map(toVote)
    .sort((a, b) => b.time.localeCompare(a.time) || b.id - a.id);
}

async function althingiVotes(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam === null ? DEFAULT_DAYS : Number(daysParam);
  if (!/^\d+$/.test(daysParam ?? "1") || days < 1 || days > MAX_DAYS) {
    return response(
      { error: `days must be a whole number from 1 to ${MAX_DAYS}` },
      false,
      400,
    );
  }
  const issue = url.searchParams.get("issue");
  if (issue !== null && !/^\d+$/.test(issue)) {
    return response({ error: "issue must be a number" }, false, 400);
  }

  const votes = await withCache(`althingi-votes:${days}`, TTL_SECONDS, () =>
    fetchVotes(days),
  );
  const data = issue
    ? votes.filter((vote) => vote.issue.number === Number(issue))
    : votes;

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

althingiVotes.meta = {
  endpoint: "/x/althingi/votes",
  description:
    "Recent votes in Alþingi, newest first: the issue voted on, yes/no/abstained counts and whether it passed. Optional ?days= window (1-90, default 30) and ?issue= number filter.",
};

// No min(1): Alþingi has no votes during its summer and Christmas recesses.
althingiVotes.health = { schema: z.array(Vote) };

export default althingiVotes;
