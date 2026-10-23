import { expectNonEmptyArray } from "../health.ts";
import { response } from "../utils.ts";

// TODO: Implement caching

// The backend behind hlaupadagskra.is's own frontend; not a documented API.
const EVENTS_URL = "https://backend-wispy-forest-1686.fly.dev/api/v1/events";
const SITE_URL = "https://www.hlaupadagskra.is";

interface UpstreamEvent {
  name: string;
  slug: string;
  type: string;
  activityType: string | null;
  status: string;
  displayDate: string | null;
  endDisplayDate: string | null;
  locationName: string | null;
  organizerName: string | null;
  distances: Array<{ label: string }> | null;
  registrationUrl: string | null;
  registrationStatus: string | null;
}

interface Race {
  name: string;
  date: string | null;
  endDate: string | null;
  location: string | null;
  type: string;
  activity: string | null;
  status: string;
  distances: string[];
  organizer: string | null;
  registrationUrl: string | null;
  registrationStatus: string | null;
  url: string;
}

function toRace(event: UpstreamEvent): Race {
  return {
    name: event.name,
    date: event.displayDate,
    endDate: event.endDisplayDate,
    location: event.locationName,
    type: event.type,
    activity: event.activityType,
    status: event.status,
    distances: (event.distances ?? []).map((distance) => distance.label),
    organizer: event.organizerName,
    registrationUrl: event.registrationUrl,
    registrationStatus: event.registrationStatus,
    url: `${SITE_URL}/events/${event.slug}`,
  };
}

function byDate(a: Race, b: Race): number {
  if (a.date === b.date) return 0;
  if (a.date === null) return 1;
  if (b.date === null) return -1;
  return a.date < b.date ? -1 : 1;
}

async function raceCalendar(request: Request): Promise<Response> {
  const serverResponse = await fetch(EVENTS_URL);

  if (!serverResponse.ok) {
    const text = await serverResponse.text();
    console.error("Response: ", text);
    throw new Error(`Failed to fetch data: ${serverResponse.status} - ${text}`);
  }

  const events = await serverResponse.json<UpstreamEvent[]>();
  const races = events
    .filter((event) => event.type !== "Advertisement")
    .map(toRace)
    .sort(byDate);

  return response(
    races,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
}

raceCalendar.meta = {
  endpoint: "/x/race-calendar",
  description:
    "Icelandic running races from hlaupadagskra.is, sorted by date. Undated races are listed last.",
};

raceCalendar.health = { check: expectNonEmptyArray };

export default raceCalendar;
