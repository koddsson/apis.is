import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import airQuality from "./air-quality.ts";

const LATEST = {
  "STA-IS0052A": {
    name: "Akureyri Strandgata (við Hof)",
    local_id: "STA-IS0052A",
    parameters: {
      PM10: {
        unit: "µg/m3",
        resolution: "1h",
        "0": {
          endtime: "2026-10-23 13:00:00",
          value: "10.273",
          verification: 3,
        },
        "1": {
          endtime: "2026-10-23 12:00:00",
          value: "11.217",
          verification: 3,
        },
      },
      H2S: {
        unit: "µg/m3",
        resolution: "1h",
        "0": {
          endtime: "2026-10-23 12:00:00",
          value: "-0.04",
          verification: 1,
        },
      },
      CO: { unit: "mg/m3", resolution: "1h" },
    },
  },
  "STA-IS9999A": {
    name: "Unlisted station",
    local_id: "STA-IS9999A",
    parameters: {},
  },
};

const STATIONS = [
  {
    name: "Akureyri Strandgata (við Hof)",
    local_id: "STA-IS0052A",
    municipality: "Akureyri",
    latitude: "65.682",
    longitude: "-18.087",
    activity_end: null,
  },
];

beforeEach(() => {
  clearCache();
});

function mockFetch(status = 200) {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = input.toString();
    urls.push(url);
    const body = url.endsWith("getLatest") ? LATEST : STATIONS;
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { urls, restore: () => (globalThis.fetch = originalFetch) };
}

test("airQuality - returns the latest reading per pollutant and station", async () => {
  const fetchMock = mockFetch();
  try {
    const res = await airQuality(new Request("http://localhost/x/air-quality"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=900");
    assert.deepEqual(await res.json(), [
      {
        id: "STA-IS0052A",
        name: "Akureyri Strandgata (við Hof)",
        municipality: "Akureyri",
        latitude: 65.682,
        longitude: -18.087,
        readings: {
          PM10: {
            value: 10.273,
            unit: "µg/m3",
            time: "2026-10-23T13:00:00Z",
            verified: false,
          },
          H2S: {
            value: -0.04,
            unit: "µg/m3",
            time: "2026-10-23T12:00:00Z",
            verified: true,
          },
        },
      },
      {
        id: "STA-IS9999A",
        name: "Unlisted station",
        municipality: null,
        latitude: null,
        longitude: null,
        readings: {},
      },
    ]);
    assert.deepEqual(fetchMock.urls.sort(), [
      "https://api.ust.is/aq/a/getLatest",
      "https://api.ust.is/aq/a/getStations",
    ]);
  } finally {
    fetchMock.restore();
  }
});

test("airQuality - filters by station and 404s unknown ones", async () => {
  const fetchMock = mockFetch();
  try {
    const one = await airQuality(
      new Request(
        "http://localhost/x/air-quality?station=sta-is0052a&pretty=true",
      ),
    );
    const text = await one.text();
    assert.include(text, "\n");
    assert.deepEqual(
      (JSON.parse(text) as Array<{ id: string }>).map((s) => s.id),
      ["STA-IS0052A"],
    );

    const missing = await airQuality(
      new Request("http://localhost/x/air-quality?station=nope"),
    );
    assert.equal(missing.status, 404);
    assert.equal(fetchMock.urls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("airQuality - throws when UST responds with an error", async () => {
  const fetchMock = mockFetch(503);
  try {
    let thrown: unknown;
    try {
      await airQuality(new Request("http://localhost/x/air-quality"));
    } catch (error) {
      thrown = error;
    }
    assert.equal((thrown as Error).message, "Failed to fetch air quality: 503");
  } finally {
    fetchMock.restore();
  }
});
