import { XMLParser } from "fast-xml-parser";
import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const XML_URL = "https://www.althingi.is/altext/xml/thingmalalisti/";
const TTL_SECONDS = 30 * 60;

const TYPES = {
  l: "bill",
  a: "resolution",
  f: "adjournment",
  v: "no-confidence",
  b: "report-request",
  s: "report",
  n: "committee-opinion",
  m: "oral-question",
  q: "written-question",
} as const;
type BillType = (typeof TYPES)[keyof typeof TYPES];
const TYPE_VALUES = Object.values(TYPES) as [BillType, ...BillType[]];

const Bill = z.object({
  session: z.number().int(),
  number: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(TYPE_VALUES),
  addressedTo: z.string().nullable(),
  url: z.url(),
});
type Bill = z.infer<typeof Bill>;

const Document = z.object({
  number: z.number().int(),
  type: z.string(),
  time: z.iso.datetime(),
  url: z.url(),
  pdf: z.url(),
});
type Document = z.infer<typeof Document>;

const BillDetail = Bill.extend({
  status: z.string().nullable(),
  documents: z.array(Document),
});

interface UpstreamBill {
  "@_málsnúmer": string;
  "@_þingnúmer": string;
  "@_málsflokkur": "A" | "B";
  málsheiti: string;
  efnisgreining: string;
  málstegund: { "@_málstegund": string };
  fyrirspurntil?: string;
}

interface UpstreamDocument {
  "@_skjalsnúmer": string;
  útbýting: string;
  skjalategund: string;
  slóð: { html: string; pdf: string };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  isArray: (name) => name === "mál" || name === "þingskjal",
});

function https(url: string): string {
  return url.replace(/^http:/, "https:");
}

function toBill(bill: UpstreamBill): Bill {
  const number = bill["@_málsnúmer"];
  const code = bill.málstegund["@_málstegund"];
  const type = TYPES[code as keyof typeof TYPES];
  if (!type) throw new Error(`Unknown type "${code}" on issue ${number}`);
  const session = bill["@_þingnúmer"];
  return {
    session: Number(session),
    number: Number(number),
    name: bill.málsheiti,
    description: bill.efnisgreining.trim() || null,
    type,
    addressedTo: bill.fyrirspurntil ?? null,
    url: `https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=${session}&mnr=${number}`,
  };
}

function toDocument(document: UpstreamDocument): Document {
  const number = document["@_skjalsnúmer"];
  const { útbýting } = document;
  if (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(útbýting)) {
    throw new Error(`Unexpected time "${útbýting}" on document ${number}`);
  }
  return {
    number: Number(number),
    type: document.skjalategund,
    time: `${útbýting.replace(" ", "T")}:00Z`,
    url: https(document.slóð.html),
    pdf: https(document.slóð.pdf),
  };
}

async function fetchXml(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return parser.parse(await res.text());
}

async function fetchBills(): Promise<Bill[]> {
  const json = (await fetchXml(XML_URL)) as {
    málaskrá?: { mál: UpstreamBill[] } | "";
  };
  if (json.málaskrá === undefined) {
    throw new Error("Alþingi issues not found in response");
  }
  const issues = json.málaskrá ? json.málaskrá.mál : [];
  return issues
    .filter((issue) => issue["@_málsflokkur"] === "A")
    .map(toBill)
    .sort((a, b) => b.number - a.number);
}

async function fetchDetails(bill: Bill) {
  const json = (await fetchXml(
    `${XML_URL}thingmal/?lthing=${bill.session}&malnr=${bill.number}`,
  )) as {
    þingmál?: {
      mál?: [{ staðamáls?: string }];
      þingskjöl?: { þingskjal: UpstreamDocument[] } | "";
    };
  };
  const issue = json.þingmál?.mál?.[0];
  const documents = json.þingmál?.þingskjöl;
  if (!issue || !documents) {
    throw new Error(`Alþingi issue ${bill.number} not found`);
  }
  return {
    ...bill,
    status: issue.staðamáls?.trim() || null,
    documents: documents.þingskjal.map(toDocument),
  };
}

function bills() {
  return withCache("althingi-bills", TTL_SECONDS, fetchBills);
}

function cached(data: unknown[] | Record<string, unknown>, request: Request) {
  const pretty = new URL(request.url).searchParams.get("pretty") === "true";
  const res = response(data, pretty);
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

export async function althingiBills(request: Request): Promise<Response> {
  const type = new URL(request.url).searchParams.get("type");
  if (type !== null && !TYPE_VALUES.includes(type as BillType)) {
    return response(
      { error: `type must be one of ${TYPE_VALUES.join(", ")}` },
      false,
      400,
    );
  }
  const all = await bills();
  return cached(type ? all.filter((bill) => bill.type === type) : all, request);
}

althingiBills.meta = {
  endpoint: "/x/althingi/bills",
  description:
    "Issues before Alþingi this session, newest first: bills, resolutions, reports and questions to ministers. Optional ?type= filter (bill, resolution, adjournment, no-confidence, report-request, report, committee-opinion, oral-question, written-question). Status is on /x/althingi/bills/{number}.",
};

althingiBills.health = { schema: z.array(Bill) };

export async function althingiBill(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  if (!/^\d+$/.test(params.number)) {
    return response({ error: "number must be a number" }, false, 400);
  }
  const bill = (await bills()).find((b) => b.number === Number(params.number));
  if (!bill) {
    return response({ error: `Unknown issue ${params.number}` }, false, 404);
  }
  const detail = await withCache(
    `althingi-bill:${bill.session}:${bill.number}`,
    TTL_SECONDS,
    () => fetchDetails(bill),
  );
  return cached(detail, request);
}

althingiBill.meta = {
  endpoint: "/x/althingi/bills/{number}",
  description:
    "One issue before Alþingi this session with its status in Alþingi's words (e.g. \"Í nefnd eftir 1. umræðu.\", null where Alþingi doesn't track one) and its documents.",
};

althingiBill.health = { params: { number: "1" }, schema: BillDetail };
