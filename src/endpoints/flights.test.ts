import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { clearCache } from "../cache.ts";
import flights, { type Flight, parseIsavia, parseKef } from "./flights.ts";

const KEF_FLIGHTS = [
  {
    flightNumber: "FI555",
    airline: "Icelandair",
    destination: "Brussels",
    airportCode: "BRU",
    date: "2026-10-23T15:10:00.000Z",
    status: "EST",
    updatedTime: "16:46",
    gate: "C2",
    belt: "5",
    arrival: true,
    _highlightResult: {},
  },
  {
    flightNumber: "LS1568",
    airline: "Jet2",
    destination: "London Stansted",
    airportCode: "STN",
    date: "2026-10-23T10:35:00.000Z",
    status: "ATD",
    updatedTime: "10:34",
    gate: "D34",
    belt: "",
    arrival: false,
  },
  {
    flightNumber: "XX1",
    airline: "Mystery Air",
    destination: "Nowhere",
    airportCode: "",
    date: "2026-10-23T20:00:00.000Z",
    status: "NoStatus",
    gate: "",
    arrival: false,
  },
];

const KEF_PAGE = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
  { props: { pageProps: { flightArrayData: JSON.stringify(KEF_FLIGHTS) } } },
)}</script></html>`;

const ISAVIA_PAGE = `<table class="table-schedule">
<tr class="schedule-items-header"><th>Time</th><th>To</th></tr>
<tr class="schedule-items-entry" data-airline="Icelandair" data-hour="13" data-origindest="RKV" data-flight-id="1" data-landeddeparted="True">
  <td>13:15</td><td>Reykjav&#237;k</td><td>FI39</td><td>Icelandair</td><td><span>Departed 13:18</span></td><td></td>
</tr>
<tr class="schedule-items-entry" data-airline="Norlandair" data-hour="10" data-origindest="CNP" data-flight-id="2" data-landeddeparted="False">
  <td>10:00</td><td>Constable Point</td><td>FNA503</td><td>Norlandair</td><td>Cancelled</td><td></td>
</tr>
<tr class="schedule-items-entry" data-airline="Ernir &amp; co" data-hour="18" data-origindest="" data-flight-id="3" data-landeddeparted="False">
  <td>18:05</td><td>Bíldudalur</td><td>FEI101</td><td>Ernir &amp; co</td><td></td><td></td>
</tr>
</table>`;

beforeEach(() => {
  clearCache();
});

afterEach(() => {
  vi.useRealTimers();
});

function mockFetch(body: string, status = 200) {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    urls.push(input.toString());
    return Promise.resolve(new Response(body, { status }));
  };
  return { urls, restore: () => (globalThis.fetch = originalFetch) };
}

function get(type: string, query = "") {
  return flights(new Request(`http://localhost/x/flights/${type}${query}`), {
    type,
  });
}

test("parseKef - splits by direction and maps status codes", () => {
  assert.deepEqual(parseKef(KEF_PAGE, "arrivals"), [
    {
      flightNumber: "FI555",
      airline: "Icelandair",
      airport: "Brussels",
      airportCode: "BRU",
      scheduled: "2026-10-23T15:10:00.000Z",
      status: "Estimated",
      updated: "16:46",
      gate: "C2",
      belt: "5",
    },
  ]);

  const departures = parseKef(KEF_PAGE, "departures");
  assert.deepEqual(
    departures.map((flight) => [flight.status, flight.belt, flight.updated]),
    [
      ["Departed", null, "10:34"],
      [null, null, null],
    ],
  );
  assert.isNull(departures[1].airportCode);
  assert.isNull(departures[1].gate);
});

test("parseKef - throws when the flight data is missing", () => {
  assert.throws(() => parseKef("<html></html>", "arrivals"), "not found");
});

test("parseIsavia - reads the schedule table", () => {
  assert.deepEqual(parseIsavia(ISAVIA_PAGE, "2026-10-23"), [
    {
      flightNumber: "FI39",
      airline: "Icelandair",
      airport: "Reykjavík",
      airportCode: "RKV",
      scheduled: "2026-10-23T13:15:00.000Z",
      status: "Departed",
      updated: "13:18",
      gate: null,
      belt: null,
    },
    {
      flightNumber: "FNA503",
      airline: "Norlandair",
      airport: "Constable Point",
      airportCode: "CNP",
      scheduled: "2026-10-23T10:00:00.000Z",
      status: "Cancelled",
      updated: null,
      gate: null,
      belt: null,
    },
    {
      flightNumber: "FEI101",
      airline: "Ernir & co",
      airport: "Bíldudalur",
      airportCode: null,
      scheduled: "2026-10-23T18:05:00.000Z",
      status: null,
      updated: null,
      gate: null,
      belt: null,
    },
  ]);
});

test("parseIsavia - throws when the table is missing", () => {
  assert.throws(() => parseIsavia("<html></html>", "2026-10-23"), "not found");
});

test("flights - serves Keflavík from one cached page", async () => {
  const fetchMock = mockFetch(KEF_PAGE);
  try {
    const arrivals = await get("arrivals");
    assert.equal(arrivals.status, 200);
    assert.equal(arrivals.headers.get("Cache-Control"), "public, max-age=120");
    assert.equal((await arrivals.json<Flight[]>()).length, 1);

    const departures = await get("departures", "?airport=kef");
    assert.equal((await departures.json<Flight[]>()).length, 2);

    assert.deepEqual(fetchMock.urls, [
      "https://www.kefairport.is/en/flights/arrivals",
    ]);
  } finally {
    fetchMock.restore();
  }
});

test("flights - reads domestic airports from isavia.is", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  const fetchMock = mockFetch(ISAVIA_PAGE);
  try {
    const res = await get("departures", "?airport=AEY&pretty=true");
    assert.equal(
      fetchMock.urls[0],
      "https://www.isavia.is/en/akureyri-airport/flight-schedule/departures",
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.equal(
      (JSON.parse(text) as Flight[])[0].scheduled,
      "2026-10-23T13:15:00.000Z",
    );
  } finally {
    fetchMock.restore();
  }
});

test("flights - rejects unknown directions and airports", async () => {
  const sideways = await get("sideways");
  assert.equal(sideways.status, 400);

  const unknown = await get("arrivals", "?airport=XYZ");
  assert.equal(unknown.status, 400);
  assert.include(
    (await unknown.json<{ error: string }>()).error,
    "Unknown airport XYZ",
  );
});

test("flights - throws when the source responds with an error", async () => {
  const fetchMock = mockFetch("down", 503);
  try {
    let thrown: unknown;
    try {
      await get("arrivals");
    } catch (error) {
      thrown = error;
    }
    assert.equal((thrown as Error).message, "Failed to fetch flights: 503");
  } finally {
    fetchMock.restore();
  }
});

test("flights - health check expects Keflavík arrivals", () => {
  assert.isUndefined(flights.health.check([{}]));
  assert.include(flights.health.check([]) ?? "", "Keflavík");
});
