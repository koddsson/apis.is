import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import traffic from "./traffic.ts";

beforeEach(() => {
  clearCache();
});

function days(counts: Array<number | null>, dates: Array<string | null>) {
  return Object.fromEntries(
    counts.flatMap((count, i) => [
      [`UMF_DAGUR${i + 1}`, count],
      [`DAGS_DAGUR${i + 1}`, dates[i]],
    ]),
  );
}

const WEEK = [
  "2026-10-23T23:59:59Z",
  "2026-10-22T23:59:59Z",
  "2026-10-21T23:59:59Z",
  "2026-10-20T23:59:59Z",
  "2026-10-19T23:59:59Z",
  "2026-10-18T23:59:59Z",
  "2026-10-17T23:59:59Z",
];

const COUNTERS = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-20.80621046, 64.20183627] },
      properties: {
        IDSTOD: 82,
        NAFN: "Lyngdalsheiði",
        STEFNA: "Til austurs",
        UMF_15MIN: 3,
        MEDALHRADI_15MIN: 84,
        UMF_I_DAG: 626,
        DAGS_SIDUSTUGAGNA: "2026-10-24T19:00:00Z",
        MAELISTOD_TEGUND: 1,
        ...days([700, 650, 600, 610, 620, 630, 640], WEEK),
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-20.80621646, 64.20186491] },
      properties: {
        IDSTOD: 82,
        NAFN: "Lyngdalsheiði",
        STEFNA: "Til vesturs",
        UMF_15MIN: 6,
        MEDALHRADI_15MIN: null,
        UMF_I_DAG: 1008,
        DAGS_SIDUSTUGAGNA: "2026-10-24T19:00:00Z",
        MAELISTOD_TEGUND: 1,
        ...days([1100, 1000, 990, 980, 970, 960, 950], WEEK),
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-22.53312023, 64.83072503] },
      properties: {
        IDSTOD: 77,
        NAFN: "Hafursfell",
        STEFNA: "Samanlögð umferð óháð stefnu",
        UMF_15MIN: null,
        MEDALHRADI_15MIN: null,
        UMF_I_DAG: null,
        DAGS_SIDUSTUGAGNA: "2026-10-01T09:15:00Z",
        MAELISTOD_TEGUND: 4,
        ...days(
          [1442, null, null, null, null, null, null],
          [WEEK[0], WEEK[1], null, null, null, null, null],
        ),
      },
    },
  ],
};

function mockFetch(body: unknown, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    requested.push(input.toString());
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

test("traffic - groups each station's directions", async () => {
  const server = mockFetch(COUNTERS);
  try {
    const res = await traffic(new Request("http://localhost/x/traffic"));
    const data = await res.json();
    assert.isUndefined(validate(traffic.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
    assert.include(server.requested[0], "srsName=EPSG:4326");
    assert.deepEqual(data, [
      {
        id: 82,
        name: "Lyngdalsheiði",
        latitude: 64.20183627,
        longitude: -20.80621046,
        updated: "2026-10-24T19:00:00Z",
        directions: [
          {
            direction: "Til austurs",
            last15Minutes: 3,
            averageSpeed: 84,
            today: 626,
            days: [
              { date: "2026-10-23", count: 700 },
              { date: "2026-10-22", count: 650 },
              { date: "2026-10-21", count: 600 },
              { date: "2026-10-20", count: 610 },
              { date: "2026-10-19", count: 620 },
              { date: "2026-10-18", count: 630 },
              { date: "2026-10-17", count: 640 },
            ],
          },
          {
            direction: "Til vesturs",
            last15Minutes: 6,
            averageSpeed: null,
            today: 1008,
            days: [
              { date: "2026-10-23", count: 1100 },
              { date: "2026-10-22", count: 1000 },
              { date: "2026-10-21", count: 990 },
              { date: "2026-10-20", count: 980 },
              { date: "2026-10-19", count: 970 },
              { date: "2026-10-18", count: 960 },
              { date: "2026-10-17", count: 950 },
            ],
          },
        ],
      },
      {
        id: 77,
        name: "Hafursfell",
        latitude: 64.83072503,
        longitude: -22.53312023,
        updated: "2026-10-01T09:15:00Z",
        directions: [
          {
            direction: "Samanlögð umferð óháð stefnu",
            last15Minutes: null,
            averageSpeed: null,
            today: null,
            days: [
              { date: "2026-10-23", count: 1442 },
              { date: "2026-10-22", count: null },
            ],
          },
        ],
      },
    ]);
  } finally {
    server.restore();
  }
});

test("traffic - filters by station and 404s unknown ones", async () => {
  const server = mockFetch(COUNTERS);
  try {
    const one = await traffic(
      new Request("http://localhost/x/traffic?station=77&pretty=true"),
    );
    const text = await one.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((station: { name: string }) => station.name),
      ["Hafursfell"],
    );

    const missing = await traffic(
      new Request("http://localhost/x/traffic?station=1"),
    );
    assert.equal(missing.status, 404);
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("traffic - throws when Vegagerðin responds with an error", async () => {
  const server = mockFetch({}, 503);
  try {
    await traffic(new Request("http://localhost/x/traffic")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});
