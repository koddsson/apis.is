import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// DOKK's embed API behind the port authorities' cruise schedules.
const SOURCE_URL = "https://portal.dokk.com/api/embed/calendar";
// Icelandic port authorities; the other calendar IDs are Faroese or duplicates.
const CALENDARS = [2, 5, 7, 8, 9, 10, 17, 18, 19, 20, 21, 23];
const TTL_SECONDS = 60 * 60;
const UPCOMING_DAYS = 365;

const Call = z.object({
  id: z.number(),
  port: z.string(),
  portCode: z.string().nullable(),
  berth: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  arrival: z.iso.datetime(),
  departure: z.iso.datetime(),
  status: z.string().nullable(),
  turnaround: z.boolean(),
  vessel: z.object({
    name: z.string().nullable(),
    imo: z.string().nullable(),
    type: z.string().nullable(),
    flag: z.string().nullable(),
    passengers: z.number().nullable(),
    passengersEstimate: z.string().nullable(),
    crew: z.number().nullable(),
    length: z.number().nullable(),
    beam: z.number().nullable(),
    draught: z.number().nullable(),
    grossTonnage: z.number().nullable(),
    buildYear: z.number().nullable(),
  }),
  agency: z.string().nullable(),
  portAuthority: z.string().nullable(),
});
type Call = z.infer<typeof Call>;

const UpstreamCall = z.object({
  id: z.number(),
  arrival: z.iso.datetime(),
  departure: z.iso.datetime(),
  status: z.string().nullable(),
  port_name: z.string(),
  port_locode: z.string().nullable(),
  // Left out entirely until a berth is assigned.
  location_name: z.string().nullish(),
  location_latitude: z.number().nullish(),
  location_longitude: z.number().nullish(),
  turn_around: z.boolean(),
  vessel_name: z.string().nullable(),
  vessel_imo: z.string().nullable(),
  vessel_type: z.string().nullable(),
  vessel_flag: z.string().nullable(),
  vessel_passengers: z.number().nullable(),
  vessel_passengers_estimate: z.string().nullable(),
  vessel_crew: z.number().nullable(),
  vessel_length_overall: z.number().nullable(),
  vessel_breadth_extreme: z.number().nullable(),
  vessel_draught: z.number().nullable(),
  vessel_gross_tonnage: z.number().nullable(),
  vessel_build_year: z.number().nullable(),
  agency_name: z.string().nullable(),
  port_organization_name: z.string().nullable(),
});

async function fetchCalendar(
  id: number,
  start: string,
  end: string,
): Promise<Call[]> {
  const res = await fetch(
    `${SOURCE_URL}/${id}?start_date=${start}&end_date=${end}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch DOKK calendar ${id}: ${res.status}`);
  }
  const calls = z.array(UpstreamCall).parse(await res.json());

  return calls.map((call) => ({
    id: call.id,
    port: call.port_name,
    // Ports without a UN/LOCODE are given "000".
    portCode: call.port_locode === "000" ? null : call.port_locode,
    berth: call.location_name ?? null,
    latitude: call.location_latitude ?? null,
    longitude: call.location_longitude ?? null,
    arrival: call.arrival,
    departure: call.departure,
    status: call.status,
    turnaround: call.turn_around,
    vessel: {
      name: call.vessel_name,
      imo: call.vessel_imo,
      type: call.vessel_type,
      flag: call.vessel_flag,
      passengers: call.vessel_passengers,
      passengersEstimate: call.vessel_passengers_estimate,
      crew: call.vessel_crew,
      length: call.vessel_length_overall,
      beam: call.vessel_breadth_extreme,
      draught: call.vessel_draught,
      grossTonnage: call.vessel_gross_tonnage,
      buildYear: call.vessel_build_year,
    },
    agency: call.agency_name,
    portAuthority: call.port_organization_name,
  }));
}

function fetchCalls(start: string, end: string): Promise<Call[]> {
  return withCache(`ships:${start}:${end}`, TTL_SECONDS, async () => {
    const calendars = await Promise.all(
      CALENDARS.map((id) => fetchCalendar(id, start, end)),
    );
    const calls = new Map(calendars.flat().map((call) => [call.id, call]));
    return [...calls.values()].sort(
      (a, b) => a.arrival.localeCompare(b.arrival) || a.id - b.id,
    );
  });
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function upcoming(): Promise<Call[]> {
  const today = new Date();
  const end = new Date(today.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000);
  return fetchCalls(day(today), day(end));
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && day(date) === value;
}

async function ships(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const port = url.searchParams.get("port")?.toLowerCase();
  if (date && !isDate(date)) {
    return response({ error: "date must be YYYY-MM-DD" }, false, 400);
  }

  const calls = await (date ? fetchCalls(date, date) : upcoming());
  const isPort = (call: Call) => call.port.toLowerCase() === port;
  const data = port ? calls.filter(isPort) : calls;
  if (port && data.length === 0 && !(await upcoming()).some(isPort)) {
    return response(
      { error: `Unknown port ${url.searchParams.get("port")}` },
      false,
      404,
    );
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

ships.meta = {
  endpoint: "/x/ships",
  description:
    "Cruise ship calls at Icelandic ports from the DOKK port-call system: vessel, IMO, arrival and departure (UTC), berth with coordinates, passengers, crew and agency. Lists the coming year by default; ?date=YYYY-MM-DD lists ships in port that day (past or future) and ?port= filters by port name, e.g. Reykjavík or Ísafjörður.",
};

ships.health = { schema: z.array(Call).min(1) };

export default ships;
