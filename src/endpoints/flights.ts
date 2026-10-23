import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const TTL_SECONDS = 120;
// Keflavík's arrivals page embeds both arrivals and departures.
const KEF_URL = "https://www.kefairport.is/en/flights/arrivals";

// isavia.is page slugs for the domestic airports, by IATA code.
const DOMESTIC_AIRPORTS: Record<string, string> = {
  RKV: "reykjavik",
  AEY: "akureyri",
  EGS: "egilsstadir",
  IFJ: "isafjordur",
  VEY: "vestmannaeyjar",
  HZK: "husavik",
  GJR: "gjogur",
  GRY: "grimsey",
  HFN: "hornafjordur",
  THO: "thorshofn",
  VPN: "vopnafjordur",
  BIU: "bildudalur",
};

// English labels from kefairport.is's own translations.
const KEF_STATUSES: Record<string, string> = {
  ATA: "Landed",
  ATD: "Departed",
  BAS: "Bags arrive shortly",
  BDC: "Gate closed",
  BDF: "Final call",
  BDO: "Boarding",
  BOB: "Bags on belt",
  CIC: "Check-in closed",
  CIO: "Check-in open",
  CNL: "Cancelled",
  DEL: "Delayed",
  DIV: "Diverted",
  EST: "Estimated",
  FIN: "Confirmed",
  LBB: "All bags on belt",
  NIF: "Waiting for next information",
  OFF: "Departed",
  PRE: "Go to gate",
  RTN: "Estimated",
  SCH: "Scheduled",
};

type Direction = "arrivals" | "departures";

export interface Flight {
  flightNumber: string;
  airline: string;
  airport: string;
  airportCode: string | null;
  scheduled: string;
  status: string | null;
  updated: string | null;
  gate: string | null;
  belt: string | null;
}

interface KefFlight {
  flightNumber: string;
  airline: string;
  destination: string;
  airportCode: string;
  date: string;
  status: string;
  updatedTime?: string;
  gate?: string;
  belt?: string;
  arrival: boolean;
}

export function parseKef(html: string, direction: Direction): Flight[] {
  const match = /"flightArrayData":("(?:[^"\\]|\\.)*")/.exec(html);
  if (!match) throw new Error("Flight data not found on kefairport.is page");
  const flights = JSON.parse(JSON.parse(match[1])) as KefFlight[];

  return flights
    .filter((flight) => flight.arrival === (direction === "arrivals"))
    .map((flight) => ({
      flightNumber: flight.flightNumber,
      airline: flight.airline,
      airport: flight.destination,
      airportCode: flight.airportCode || null,
      scheduled: flight.date,
      status: KEF_STATUSES[flight.status] ?? null,
      updated: flight.updatedTime || null,
      gate: flight.gate || null,
      belt: flight.belt || null,
    }));
}

function decode(cell: string): string {
  return cell
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// `today` is a YYYY-MM-DD date; isavia.is lists today's flights in local
// time, which in Iceland is UTC.
export function parseIsavia(html: string, today: string): Flight[] {
  const table = /<table class="table-schedule">(.*?)<\/table>/s.exec(html);
  if (!table) throw new Error("Flight table not found on isavia.is page");

  return [
    ...table[1].matchAll(
      /<tr class="schedule-items-entry"[^>]*data-origindest="([^"]*)"[^>]*>(.*?)<\/tr>/gs,
    ),
  ].map(([, airportCode, row]) => {
    const [time, airport, flightNumber, airline, statusText] = [
      ...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs),
    ].map(([, cell]) => decode(cell));
    const status = /^(.*?)(?:\s+(\d{2}:\d{2}))?$/.exec(statusText);
    return {
      flightNumber,
      airline,
      airport,
      airportCode: airportCode || null,
      scheduled: `${today}T${time}:00.000Z`,
      status: status?.[1] || null,
      updated: status?.[2] ?? null,
      gate: null,
      belt: null,
    };
  });
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch flights: ${res.status}`);
  return res.text();
}

async function flights(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const airport = (url.searchParams.get("airport") ?? "KEF").toUpperCase();
  const direction = params.type;

  if (direction !== "arrivals" && direction !== "departures") {
    return response(
      { error: "Use /x/flights/arrivals or /x/flights/departures" },
      false,
      400,
    );
  }
  if (airport !== "KEF" && !(airport in DOMESTIC_AIRPORTS)) {
    return response(
      {
        error: `Unknown airport ${airport}. Supported: KEF, ${Object.keys(DOMESTIC_AIRPORTS).join(", ")}`,
      },
      false,
      400,
    );
  }

  let data: Flight[];
  if (airport === "KEF") {
    const html = await withCache("flights-KEF", TTL_SECONDS, () =>
      fetchPage(KEF_URL),
    );
    data = parseKef(html, direction);
  } else {
    const page = `https://www.isavia.is/en/${DOMESTIC_AIRPORTS[airport]}-airport/flight-schedule/${direction}`;
    const html = await withCache(
      `flights-${airport}-${direction}`,
      TTL_SECONDS,
      () => fetchPage(page),
    );
    data = parseIsavia(html, new Date().toISOString().slice(0, 10));
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

flights.meta = {
  endpoint: "/x/flights/{type}",
  description:
    "Today's arrivals or departures ({type}) from Isavia. ?airport= takes KEF (default) or a domestic airport code such as RKV or AEY.",
};

flights.health = {
  params: { type: "arrivals" },
  check: (data: unknown) =>
    Array.isArray(data) && data.length > 0
      ? undefined
      : "Expected at least one Keflavík arrival",
};

export default flights;
