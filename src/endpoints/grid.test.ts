import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
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

test("grid - throws when Landsnet responds with an error", async () => {
  const fetchMock = mockFetch(MEASUREMENTS, 503);
  try {
    let thrown: unknown;
    try {
      await grid(new Request("http://localhost/x/grid"));
    } catch (error) {
      thrown = error;
    }
    assert.equal((thrown as Error).message, "Failed to fetch grid data: 503");
  } finally {
    fetchMock.restore();
  }
});

test("grid - health check needs a positive total", () => {
  assert.isUndefined(grid.health.check({ totalPowerFlow: 2207 }));
  assert.include(grid.health.check({ totalPowerFlow: null }) ?? "", "positive");
});
