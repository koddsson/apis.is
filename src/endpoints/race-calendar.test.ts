import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import raceCalendar from "./race-calendar.ts";

function upstreamEvent(overrides: Record<string, unknown>) {
  return {
    id: "id",
    name: "Race",
    slug: "race",
    type: "Race",
    activityType: "Running",
    status: "Confirmed",
    displayDate: null,
    endDisplayDate: null,
    locationName: "Reykjavík",
    organizerName: null,
    distances: [],
    registrationUrl: null,
    registrationStatus: null,
    daysUntil: 1,
    ...overrides,
  };
}

const mockRaceCalendarResponse = [
  upstreamEvent({
    name: "Reykjavíkurmaraþon",
    slug: "rvkmarathon",
    displayDate: "2027-08-21",
    distances: [{ label: "42.2 km", ticketStatus: "Open" }, { label: "10 km" }],
    organizerName: "ÍBR",
    registrationUrl: "https://example.com/register",
    registrationStatus: "Open",
  }),
  upstreamEvent({ name: "Hlaupahópur", slug: "social", type: "Social" }),
  upstreamEvent({
    name: "Laugavegshlaupið",
    slug: "laugavegur",
    activityType: "TrailRunning",
    displayDate: "2027-07-18",
    endDisplayDate: "2027-07-18",
    locationName: "Landmannalaugar",
    distances: null,
  }),
  upstreamEvent({ name: "Ad", slug: "ad", type: "Advertisement" }),
  upstreamEvent({
    name: "Cancelled run",
    slug: "cancelled",
    status: "Cancelled",
    displayDate: "2027-07-18",
  }),
  upstreamEvent({ name: "Undated", slug: "undated" }),
];

type Race = {
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
};

beforeEach(() => {
  clearCache();
});

test("raceCalendar - returns races sorted by date without ads", async () => {
  const originalFetch = globalThis.fetch;
  let requested = "";
  globalThis.fetch = (input: string | URL | Request) => {
    requested = input.toString();
    return Promise.resolve(
      new Response(JSON.stringify(mockRaceCalendarResponse), {
        status: 200,
      }),
    );
  };

  try {
    const req = new Request("http://localhost/x/race-calendar");
    const res = await raceCalendar(req);
    assert.isUndefined(
      validate(raceCalendar.health.schema, await res.clone().json()),
    );

    assert.deepEqual(res.status, 200);
    assert.deepEqual(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(
      requested,
      "https://backend-wispy-forest-1686.fly.dev/api/v1/events",
    );

    const data = await res.json<Race[]>();
    assert.deepEqual(
      data.map((race) => race.name),
      [
        "Laugavegshlaupið",
        "Cancelled run",
        "Reykjavíkurmaraþon",
        "Hlaupahópur",
        "Undated",
      ],
    );
    assert.deepEqual(data[2], {
      name: "Reykjavíkurmaraþon",
      date: "2027-08-21",
      endDate: null,
      location: "Reykjavík",
      type: "Race",
      activity: "Running",
      status: "Confirmed",
      distances: ["42.2 km", "10 km"],
      organizer: "ÍBR",
      registrationUrl: "https://example.com/register",
      registrationStatus: "Open",
      url: "https://www.hlaupadagskra.is/events/rvkmarathon",
    });
    assert.deepEqual(data[0].distances, []);
    assert.equal(data[1].status, "Cancelled");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("raceCalendar - throws when upstream responds with an error", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  globalThis.fetch = () =>
    Promise.resolve(new Response("Service Unavailable", { status: 503 }));
  console.error = () => {};

  try {
    const req = new Request("http://localhost/x/race-calendar");
    let thrown: unknown;
    try {
      await raceCalendar(req);
    } catch (error) {
      thrown = error;
    }

    assert.instanceOf(thrown, Error);
    assert.include(
      (thrown as Error).message,
      "Failed to fetch data: 503 - Service Unavailable",
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("raceCalendar - returns compact JSON by default", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockRaceCalendarResponse), {
        status: 200,
      }),
    );
  };

  try {
    const req = new Request("http://localhost/x/race-calendar");
    const res = await raceCalendar(req);

    const text = await res.text();
    assert.deepEqual(text.includes("\n"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("raceCalendar - returns pretty JSON when pretty=true", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockRaceCalendarResponse), {
        status: 200,
      }),
    );
  };

  try {
    const req = new Request("http://localhost/x/race-calendar?pretty=true");
    const res = await raceCalendar(req);

    const text = await res.text();
    assert.deepEqual(text.includes("\n"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("raceCalendar - has correct meta information", () => {
  assert.deepEqual(raceCalendar.meta?.endpoint, "/x/race-calendar");
  assert.include(raceCalendar.meta?.description || "", "hlaupadagskra.is");
});

test("raceCalendar - caches races and sets Cache-Control", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    return Promise.resolve(
      new Response(JSON.stringify(mockRaceCalendarResponse)),
    );
  };

  try {
    const req = new Request("http://localhost/x/race-calendar");
    const first = await raceCalendar(req);
    await raceCalendar(req);

    assert.equal(calls, 1);
    assert.equal(first.headers.get("Cache-Control"), "public, max-age=3600");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
