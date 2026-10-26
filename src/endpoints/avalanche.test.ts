import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import avalanche from "./avalanche.ts";

beforeEach(() => {
  clearCache();
});

function details(regionId: string, overrides: Record<string, unknown> = {}) {
  return {
    regionId,
    regionName: "Tröllaskagi, utanverður",
    keypoints: "There is little snow in the forecast area. ",
    recentAvalanches: "None recorded.",
    weatherForecast: "Calm weather.",
    snowpack: "A thin snow cover remains at higher elevations.\n",
    createdAt: "2026-10-23T12:35:22.946867",
    validFrom: "2026-10-24T00:00:00",
    validTo: "2026-10-26T00:00:00",
    problems: [],
    dangers: {
      "2026-10-25T00:00:00": "Stable",
      "2026-10-26T00:00:00": "StableToModerate",
    },
    ...overrides,
  };
}

const UPSTREAM: Record<string, unknown> = {
  "status/": {
    summary: "Little snow in most places. ",
    createdTime: "2026-10-26T13:43:31.67883",
  },
  "details/SV/": details("SV", {
    regionName: "Suðvesturhornið",
    dangers: {
      "2026-10-24T00:00:00": "NoForecast",
      "2026-10-25T00:00:00": "ModerateToPoor",
      "2026-10-26T00:00:00": "Poor",
      "2026-10-27T00:00:00": "Unstable",
    },
  }),
  "details/VN/": null,
  "details/TN/": details("TN", {
    problems: [
      {
        type: "WindDrift",
        height: "Above",
        heightMeters: 700,
        aspectFrom: "E",
        aspectTo: "Sw",
        probability: "VeryLikely",
        size: 1,
        description: "",
      },
      {
        type: "GlidingSnow",
        height: "All",
        heightMeters: null,
        aspectFrom: null,
        aspectTo: null,
        probability: null,
        size: null,
        description: "Glide cracks.",
      },
    ],
  }),
  "details/EY/": details("EY"),
  "details/AF/": details("AF"),
};

function mockFetch(upstream: Record<string, unknown> = UPSTREAM, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = new URL(input.toString());
    requested.push(url.toString());
    const path = url.pathname.replace("/api/avalanche/forecast/", "");
    const body = upstream[path];
    return Promise.resolve(
      body == null
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(body), { status }),
    );
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

function get(query = "") {
  return avalanche(new Request(`http://localhost/x/avalanche${query}`));
}

test("avalanche - combines the summary and each region's forecast", async () => {
  const server = mockFetch();
  try {
    const res = await get();
    const data = await res.json<{
      summary: string;
      updated: string;
      regions: Array<Record<string, unknown>>;
    }>();
    assert.isUndefined(validate(avalanche.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=600");
    assert.lengthOf(server.requested, 6);
    assert.isTrue(server.requested.every((url) => url.endsWith("?lang=is")));

    assert.equal(data.summary, "Little snow in most places.");
    assert.equal(data.updated, "2026-10-26T13:43:31.678Z");
    assert.deepEqual(
      data.regions.map((region) => region.id),
      ["SV", "TN", "EY", "AF"],
    );
    assert.deepEqual(data.regions[0].danger, [
      { date: "2026-10-24", level: null },
      { date: "2026-10-25", level: 3 },
      { date: "2026-10-26", level: 4 },
      { date: "2026-10-27", level: 5 },
    ]);
    assert.deepEqual(data.regions[1], {
      id: "TN",
      name: "Tröllaskagi, utanverður",
      updated: "2026-10-23T12:35:22.946Z",
      validFrom: "2026-10-24",
      validTo: "2026-10-26",
      danger: [
        { date: "2026-10-25", level: 1 },
        { date: "2026-10-26", level: 2 },
      ],
      problems: [
        {
          type: "wind-drift",
          elevation: "above",
          elevationMeters: 700,
          aspectFrom: "E",
          aspectTo: "SW",
          probability: "very-likely",
          size: 1,
          description: "",
        },
        {
          type: "gliding-snow",
          elevation: "all",
          elevationMeters: null,
          aspectFrom: null,
          aspectTo: null,
          probability: null,
          size: null,
          description: "Glide cracks.",
        },
      ],
      keyPoints: "There is little snow in the forecast area.",
      snowpack: "A thin snow cover remains at higher elevations.",
      weather: "Calm weather.",
      recentAvalanches: "None recorded.",
    });
  } finally {
    server.restore();
  }
});

test("avalanche - filters by region and caches per language", async () => {
  const server = mockFetch();
  try {
    const res = await get("?region=tn&lang=en&pretty=true");
    const text = await res.text();
    assert.include(text, "\n");
    const data = JSON.parse(text);
    assert.deepEqual(
      data.regions.map((region: { id: string }) => region.id),
      ["TN"],
    );
    assert.isTrue(server.requested.every((url) => url.endsWith("?lang=en")));

    await get("?lang=en");
    assert.lengthOf(server.requested, 6);
  } finally {
    server.restore();
  }
});

test("avalanche - allows the off season without forecasts", async () => {
  const server = mockFetch({});
  try {
    const data = await (await get()).json();
    assert.isUndefined(validate(avalanche.health.schema, data));
    assert.deepEqual(data, { summary: null, updated: null, regions: [] });
  } finally {
    server.restore();
  }
});

test("avalanche - rejects unknown regions and languages", async () => {
  assert.equal((await get("?region=XX")).status, 404);
  assert.equal((await get("?lang=de")).status, 400);
});

test("avalanche - throws when Veðurstofa responds with an error", async () => {
  const server = mockFetch(UPSTREAM, 503);
  try {
    await get().then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});
