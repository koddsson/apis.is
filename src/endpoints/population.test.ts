import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { births, latestFullYear, population } from "./population.ts";

function jsonStat(quarters: string[], values: Array<number | null>) {
  return {
    value: values,
    dimension: {
      Ársfjórðungur: {
        category: {
          index: Object.fromEntries(quarters.map((q, i) => [q, i])),
        },
      },
    },
  };
}

const BIRTH_QUARTERS = [
  "2023Q3",
  "2023Q4",
  "2024Q1",
  "2024Q2",
  "2024Q3",
  "2024Q4",
  "2025Q1",
  "2025Q2",
  "2025Q3",
  "2025Q4",
  "2026Q1",
  "2026Q2",
];
const BIRTH_VALUES = [
  1140, 1010, 1010, 1090, 1130, 1050, 1050, 1100, 1140, 1080, 1110, 1130,
];

beforeEach(() => {
  clearCache();
});

function mockFetch(body: unknown, status = 200) {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: { query: unknown[] } }> = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: input.toString(),
      body: JSON.parse(init?.body as string),
    });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { requests, restore: () => (globalThis.fetch = originalFetch) };
}

test("population - returns the latest quarter's figure", async () => {
  const fetchMock = mockFetch(jsonStat(["2026Q2"], [396500]));
  try {
    const res = await population(new Request("http://localhost/x/population"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=86400");
    const data = await res.json<Record<string, unknown>>();
    assert.equal(data.population, 396500);
    assert.equal(data.period, "2026Q2");
    assert.include(data.note as string, "Not a live count");

    assert.match(fetchMock.requests[0].url, /MAN10001\.px$/);
    assert.deepEqual(fetchMock.requests[0].body.query, [
      { code: "Ársfjórðungur", selection: { filter: "top", values: ["1"] } },
      { code: "Sveitarfélag", selection: { filter: "item", values: ["IS"] } },
      {
        code: "Kyn og ríkisfang",
        selection: { filter: "item", values: ["0"] },
      },
    ]);
  } finally {
    fetchMock.restore();
  }
});

test("population - returns nulls when Hagstofa has no data", async () => {
  const fetchMock = mockFetch(jsonStat([], []));
  try {
    const res = await population(
      new Request("http://localhost/x/population?pretty=true"),
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.isNull(JSON.parse(text).population);
  } finally {
    fetchMock.restore();
  }
});

test("births - returns recent quarters and the latest full year", async () => {
  const fetchMock = mockFetch(jsonStat(BIRTH_QUARTERS, BIRTH_VALUES));
  try {
    const res = await births(
      new Request("http://localhost/x/population/births?quarters=2"),
    );
    const data = await res.json<Record<string, unknown>>();
    assert.deepEqual(data.periods, [
      { period: "2026Q1", births: 1110 },
      { period: "2026Q2", births: 1130 },
    ]);
    assert.deepEqual(data.latestFullYear, {
      year: 2025,
      births: 4370,
      perDay: 11.97,
    });
    assert.match(fetchMock.requests[0].url, /MAN10002\.px$/);
    assert.deepEqual(
      (fetchMock.requests[0].body.query as Array<{ selection: unknown }>)[0]
        .selection,
      { filter: "top", values: ["12"] },
    );
  } finally {
    fetchMock.restore();
  }
});

test("births - rejects invalid quarter counts", async () => {
  for (const quarters of ["0", "61", "two", "1.5"]) {
    const res = await births(
      new Request(`http://localhost/x/population/births?quarters=${quarters}`),
    );
    assert.equal(res.status, 400, quarters);
  }
});

test("latestFullYear - handles leap years, gaps, and missing years", () => {
  assert.deepEqual(
    latestFullYear([
      { period: "2024Q1", value: 1000 },
      { period: "2024Q2", value: 1000 },
      { period: "2024Q3", value: 1000 },
      { period: "2024Q4", value: 1000 },
      { period: "2025Q1", value: 1000 },
      { period: "2025Q2", value: null },
    ]),
    { year: 2024, births: 4000, perDay: 10.93 },
  );
  assert.isNull(latestFullYear([{ period: "2026Q1", value: 1 }]));
});

test("population - throws when Hagstofa responds with an error", async () => {
  const fetchMock = mockFetch({}, 503);
  try {
    let thrown: unknown;
    try {
      await population(new Request("http://localhost/x/population"));
    } catch (error) {
      thrown = error;
    }
    assert.equal(
      (thrown as Error).message,
      "Failed to fetch from Hagstofa: 503",
    );
  } finally {
    fetchMock.restore();
  }
});

test("population - health checks need data", () => {
  assert.isUndefined(population.health.check({ population: 396500 }));
  assert.include(
    population.health.check({ population: null }) ?? "",
    "Expected",
  );
  assert.isUndefined(births.health.check({ latestFullYear: { year: 2025 } }));
  assert.include(
    births.health.check({ latestFullYear: null }) ?? "",
    "Expected",
  );
});
