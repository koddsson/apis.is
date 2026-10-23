import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import grid from "./grid.ts";

const MEASUREMENTS = [
  {
    time: "2026-10-23T13:35:00",
    MW: 1.0,
    key: "KR1",
    substation: "KRAFLA_F",
    devicetype: "KR1",
    good: 1,
    replaced: 0,
    stop: 0,
  },
  {
    time: "2026-10-23T13:35:00",
    MW: -12.5,
    key: "BECROMAL",
    substation: "RANGARV",
    devicetype: "BECROMAL",
    good: 0,
    replaced: 0,
    stop: 1,
  },
  {
    time: "2026-10-23T13:35:00",
    MW: 2207.97,
    key: "TOTAL_POWER_FLOW",
    substation: null,
    devicetype: null,
    good: 0,
    replaced: 0,
    stop: 0,
  },
  {
    time: "2026-10-23T13:35:00",
    MW: 0.0,
    key: "REGULATING_POWER",
    substation: null,
    devicetype: null,
    good: 1,
    replaced: 0,
    stop: 0,
  },
  {
    time: "2026-10-23T13:35:00",
    MW: 455.9,
    key: "SNIÐ_I",
    substation: null,
    devicetype: null,
    good: 1,
    replaced: 0,
    stop: 0,
  },
];

const MAP = {
  SubStation: [],
  TransmissionLine: [{ MeasureType: "KR1", Name: "Kröflulína 1" }],
  Snid: [
    {
      key: "SNIÐ_I",
      name: "Snið I",
      intersects: ["HRAUNEYJARFOSSLÍNA 1", "SIGÖLDULÍNA 3"],
    },
    { key: "SNIÐ_II", name: "Snið II", intersects: ["KRÖFLULÍNA 2"] },
  ],
};

beforeEach(() => {
  clearCache();
});

function mockFetch(measurements: unknown = MEASUREMENTS, status = 200) {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = input.toString();
    urls.push(url);
    const body = url.endsWith("measurements") ? measurements : MAP;
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { urls, restore: () => (globalThis.fetch = originalFetch) };
}

test("grid - combines measurements with map names", async () => {
  const fetchMock = mockFetch();
  try {
    const res = await grid(new Request("http://localhost/x/grid"));
    assert.isUndefined(validate(grid.health.schema, await res.clone().json()));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=60");
    assert.deepEqual(await res.json(), {
      time: "2026-10-23T13:35:00Z",
      totalPowerFlow: 2207.97,
      regulatingPower: 0,
      regionalFlows: [
        {
          id: "SNIÐ_I",
          name: "Snið I",
          lines: ["HRAUNEYJARFOSSLÍNA 1", "SIGÖLDULÍNA 3"],
          flow: 455.9,
        },
        { id: "SNIÐ_II", name: "Snið II", lines: ["KRÖFLULÍNA 2"], flow: null },
      ],
      lines: [
        {
          id: "KR1",
          name: "Kröflulína 1",
          substation: "KRAFLA_F",
          flow: 1,
          stopped: false,
          reliable: true,
        },
        {
          id: "BECROMAL",
          name: null,
          substation: "RANGARV",
          flow: -12.5,
          stopped: true,
          reliable: false,
        },
      ],
    });
  } finally {
    fetchMock.restore();
  }
});

test("grid - handles an empty measurement list", async () => {
  const fetchMock = mockFetch([]);
  try {
    const res = await grid(new Request("http://localhost/x/grid?pretty=true"));
    const text = await res.text();
    assert.include(text, "\n");
    const data = JSON.parse(text);
    assert.isNull(data.time);
    assert.isNull(data.totalPowerFlow);
    assert.isNull(data.regulatingPower);
    assert.deepEqual(data.lines, []);
  } finally {
    fetchMock.restore();
  }
});

async function gridError(response: Response): Promise<string> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(response.clone());
  try {
    await grid(new Request("http://localhost/x/grid"));
    return "did not throw";
  } catch (error) {
    return (error as Error).message;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("grid - reports the status, cf-ray, and body of upstream errors", async () => {
  const blocked = await gridError(
    new Response(
      "<html><title>Attention Required!</title><h1>Sorry, you have been blocked</h1></html>",
      { status: 403, headers: { "cf-ray": "a4f1b95bacf45cc7-SIN" } },
    ),
  );
  assert.equal(
    blocked,
    "Failed to fetch grid data: 403 (cf-ray a4f1b95bacf45cc7-SIN) Attention Required! Sorry, you have been blocked",
  );

  clearCache();
  assert.equal(
    await gridError(new Response("", { status: 503 })),
    "Failed to fetch grid data: 503",
  );
});

test("grid - health schema needs a positive total", () => {
  const healthy = {
    time: null,
    totalPowerFlow: 2207,
    regulatingPower: null,
    regionalFlows: [],
    lines: [],
  };
  assert.isUndefined(validate(grid.health.schema, healthy));
  assert.include(
    validate(grid.health.schema, { ...healthy, totalPowerFlow: null }) ?? "",
    "totalPowerFlow",
  );
});
