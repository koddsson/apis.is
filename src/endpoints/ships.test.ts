import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import ships from "./ships.ts";

beforeEach(() => {
  clearCache();
});

function call(overrides: Record<string, unknown>) {
  return {
    id: 7062,
    arrival: "2027-04-08T15:00:00Z",
    departure: "2027-04-09T18:00:00Z",
    status: "accepted",
    port_name: "Reykjavík",
    location_name: "Skarfabakki",
    vessel_name: "AIDAsol",
    vessel_passengers: 2194,
    vessel_passengers_estimate: null,
    vessel_crew: 646,
    location_color: "#79AAD9",
    location_latitude: 64.153557,
    location_longitude: -21.85929,
    vessel_length_overall: 253.33,
    vessel_breadth_extreme: 37.6,
    turn_around: false,
    port_time_zone: "Atlantic/Reykjavik",
    origin_country: "",
    port_country_code: "IS",
    agency_name: "SDK Group (Cruise)",
    agency_logo:
      "https://sdkgroup.com/wp-content/uploads/sites/8/2024/05/sdk-logo.svg",
    port_organization_name: "Faxaflóahafnir sf",
    port_organization_logo:
      "https://www.datocms-assets.com/164301/1773843893-icon_blue.jpg",
    agency_website: "https://sdkgroup.com/cruise/#cruise-agency",
    port_organization_website: "https://www.faxafloahafnir.is/",
    vessel_operator_website: null,
    port_locode: "ISREY",
    vessel_image:
      "https://upload.wikimedia.org/wikipedia/commons/e/ed/AIDAsol_Genova_Tallinn_6_July_2012.JPG",
    vessel_image_license: null,
    vessel_image_credit_author: null,
    vessel_image_credit_source_url: null,
    vessel_operator_name: null,
    vessel_operator_logo: null,
    vessel_imo: "9490040",
    vessel_type: "Passenger",
    vessel_build_year: 2011,
    vessel_gross_tonnage: 71304,
    vessel_draught: 7.3,
    vessel_flag: "IT",
    ...overrides,
  };
}

const AIDASOL = call({});
const UNNAMED = call({
  id: 9198,
  arrival: "2027-04-08T15:00:00Z",
  departure: "2027-04-09T22:15:00Z",
  location_name: "VÖR Cruise Terminal",
  location_latitude: 64.156125,
  location_longitude: -21.864498,
  agency_name: "Gára ehf skipamiðlun",
  vessel_name: null,
  vessel_passengers: null,
  vessel_passengers_estimate: "4,000-4,999",
  vessel_crew: null,
  vessel_length_overall: null,
  vessel_breadth_extreme: null,
  vessel_imo: null,
  vessel_type: null,
  vessel_build_year: null,
  vessel_gross_tonnage: null,
  vessel_draught: null,
  vessel_flag: null,
});
const SYLVIA_EARLE: Record<string, unknown> = call({
  id: 7142,
  arrival: "2027-04-01T15:30:00Z",
  departure: "2027-04-01T18:00:00Z",
  port_name: "Arnarstapahöfn",
  port_locode: "000",
  vessel_name: "Sylvia Earle",
  vessel_passengers: 120,
  vessel_crew: 74,
  vessel_length_overall: 104.4,
  vessel_breadth_extreme: 18.4,
  vessel_draught: 5.3,
  vessel_gross_tonnage: 7900,
  vessel_build_year: 2021,
  turn_around: true,
  port_organization_name: "Hafnir Snæfellsbæjar",
  agency_name: "Gára ehf skipamiðlun",
  vessel_imo: "9872327",
  vessel_flag: "BS",
});
delete SYLVIA_EARLE.location_name;
delete SYLVIA_EARLE.location_latitude;
delete SYLVIA_EARLE.location_longitude;

const CALENDARS: Record<string, unknown[]> = {
  "5": [UNNAMED, AIDASOL],
  "8": [AIDASOL],
  "23": [SYLVIA_EARLE],
};

function mockFetch(calendars = CALENDARS, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: URL[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = new URL(input.toString());
    requested.push(url);
    const id = url.pathname.split("/").pop() as string;
    return Promise.resolve(
      new Response(JSON.stringify(calendars[id] ?? []), { status }),
    );
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

test("ships - combines the coming year's calls from every calendar", async () => {
  const server = mockFetch();
  try {
    const res = await ships(new Request("http://localhost/x/ships"));
    const data = await res.json();
    assert.isUndefined(validate(ships.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");

    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    assert.deepEqual(
      server.requested.map((url) => url.pathname),
      [2, 5, 7, 8, 9, 10, 17, 18, 19, 20, 21, 23].map(
        (id) => `/api/embed/calendar/${id}`,
      ),
    );
    assert.equal(server.requested[0].host, "portal.dokk.com");
    assert.equal(server.requested[0].searchParams.get("start_date"), today);
    assert.equal(server.requested[0].searchParams.get("end_date"), end);

    assert.deepEqual(data, [
      {
        id: 7142,
        port: "Arnarstapahöfn",
        portCode: null,
        berth: null,
        latitude: null,
        longitude: null,
        arrival: "2027-04-01T15:30:00Z",
        departure: "2027-04-01T18:00:00Z",
        status: "accepted",
        turnaround: true,
        vessel: {
          name: "Sylvia Earle",
          imo: "9872327",
          type: "Passenger",
          flag: "BS",
          passengers: 120,
          passengersEstimate: null,
          crew: 74,
          length: 104.4,
          beam: 18.4,
          draught: 5.3,
          grossTonnage: 7900,
          buildYear: 2021,
        },
        agency: "Gára ehf skipamiðlun",
        portAuthority: "Hafnir Snæfellsbæjar",
      },
      {
        id: 7062,
        port: "Reykjavík",
        portCode: "ISREY",
        berth: "Skarfabakki",
        latitude: 64.153557,
        longitude: -21.85929,
        arrival: "2027-04-08T15:00:00Z",
        departure: "2027-04-09T18:00:00Z",
        status: "accepted",
        turnaround: false,
        vessel: {
          name: "AIDAsol",
          imo: "9490040",
          type: "Passenger",
          flag: "IT",
          passengers: 2194,
          passengersEstimate: null,
          crew: 646,
          length: 253.33,
          beam: 37.6,
          draught: 7.3,
          grossTonnage: 71304,
          buildYear: 2011,
        },
        agency: "SDK Group (Cruise)",
        portAuthority: "Faxaflóahafnir sf",
      },
      {
        id: 9198,
        port: "Reykjavík",
        portCode: "ISREY",
        berth: "VÖR Cruise Terminal",
        latitude: 64.156125,
        longitude: -21.864498,
        arrival: "2027-04-08T15:00:00Z",
        departure: "2027-04-09T22:15:00Z",
        status: "accepted",
        turnaround: false,
        vessel: {
          name: null,
          imo: null,
          type: null,
          flag: null,
          passengers: null,
          passengersEstimate: "4,000-4,999",
          crew: null,
          length: null,
          beam: null,
          draught: null,
          grossTonnage: null,
          buildYear: null,
        },
        agency: "Gára ehf skipamiðlun",
        portAuthority: "Faxaflóahafnir sf",
      },
    ]);

    await ships(new Request("http://localhost/x/ships"));
    assert.equal(server.requested.length, 12);
  } finally {
    server.restore();
  }
});

test("ships - lists a single day and filters by port", async () => {
  const server = mockFetch();
  try {
    const res = await ships(
      new Request(
        "http://localhost/x/ships?date=2027-04-09&port=reykjav%C3%ADk&pretty=true",
      ),
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((ship: { id: number }) => ship.id),
      [7062, 9198],
    );
    assert.equal(
      server.requested[0].searchParams.get("start_date"),
      "2027-04-09",
    );
    assert.equal(
      server.requested[0].searchParams.get("end_date"),
      "2027-04-09",
    );
    assert.equal(server.requested.length, 12);
  } finally {
    server.restore();
  }
});

test("ships - 404s unknown ports but not quiet days at known ones", async () => {
  const server = mockFetch();
  try {
    const unknown = await ships(
      new Request("http://localhost/x/ships?port=Atlantis"),
    );
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { error: "Unknown port Atlantis" });

    const quiet = mockFetch({});
    try {
      const res = await ships(
        new Request(
          "http://localhost/x/ships?date=2027-01-01&port=Reykjav%C3%ADk",
        ),
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), []);
    } finally {
      quiet.restore();
    }
  } finally {
    server.restore();
  }
});

test("ships - 400s invalid dates", async () => {
  for (const date of ["tomorrow", "2027-13-01", "2027-02-30", "27-04-09"]) {
    const res = await ships(
      new Request(`http://localhost/x/ships?date=${date}`),
    );
    assert.equal(res.status, 400, date);
  }
});

test("ships - throws when DOKK responds with an error", async () => {
  const server = mockFetch({}, 500);
  try {
    await ships(new Request("http://localhost/x/ships")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "500"),
    );
  } finally {
    server.restore();
  }
});

test("ships - throws when the calendar format changes", async () => {
  const server = mockFetch({ "5": [{ ...AIDASOL, arrival: undefined }] });
  try {
    await ships(new Request("http://localhost/x/ships")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "arrival"),
    );
  } finally {
    server.restore();
  }
});
