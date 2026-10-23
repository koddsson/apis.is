import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { parseStationTime, roadConditions, roadWeather } from "./roads.ts";

const SEGMENTS = [
  {
    IdButur: 910330037.0,
    DagsSkrad: "2026-10-23T06:08:05Z",
    StuttNafnButs: "Hellisheiði eystri",
    FulltNafnButs: "Hlíðarvegur: Hellisheiði eystri",
    DagsButurBreyttist: "2026-06-02T13:25:19Z",
    AstandYfirbord: "THUNGFAERT",
    AstandLysing: "Þungfært",
    AstandLysingEn: "Difficult road conditions",
    AsthungiLysingEn: null,
  },
  {
    IdButur: 911060037.0,
    DagsSkrad: "2026-10-23T07:00:00Z",
    StuttNafnButs: "Breiðdalsheiði",
    FulltNafnButs: "Axarvegur: Breiðdalsheiði",
    DagsButurBreyttist: null,
    AstandYfirbord: "GREIDFAERT",
    AstandLysingEn: "Easily passable",
    AsthungiLysingEn: "Axle weight limit 7 tons",
  },
];

const STATIONS = [
  {
    Nr: 30,
    Nafn: "Breiðdalsheiði",
    Breidd: 64.906967,
    Lengd: -14.6035,
    Haed: 494.0,
    Dags: "23.10.2026 13:40:00",
    Vindatt: 102,
    VindattAscEng: "ESE",
    Vindhradi: 2.508,
    Vindhvida: 3.43,
    Hiti: 0.945,
    Veghiti: null,
    Raki: 88.3,
    Daggarmark: -0.773,
    Umf10Min: 0,
    UmfSum: 11,
  },
];

beforeEach(() => {
  clearCache();
});

function mockFetch(routes: Record<string, { body: unknown; status?: number }>) {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = input.toString();
    urls.push(url);
    const route = Object.entries(routes).find(([match]) => url.includes(match));
    if (!route) throw new Error(`Unexpected fetch ${url}`);
    return Promise.resolve(
      new Response(JSON.stringify(route[1].body), {
        status: route[1].status ?? 200,
      }),
    );
  };
  return { urls, restore: () => (globalThis.fetch = originalFetch) };
}

test("parseStationTime - converts Vegagerðin times to ISO", () => {
  assert.equal(parseStationTime("23.10.2026 13:40:00"), "2026-10-23T13:40:00Z");
  assert.isNull(parseStationTime("yesterday"));
});

test("roadConditions - maps road segments", async () => {
  const fetchMock = mockFetch({ faerd2017_1: { body: SEGMENTS } });
  try {
    const res = await roadConditions(
      new Request("http://localhost/x/roads/conditions"),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
    assert.deepEqual(await res.json(), [
      {
        id: 910330037,
        name: "Hellisheiði eystri",
        fullName: "Hlíðarvegur: Hellisheiði eystri",
        condition: "Difficult road conditions",
        conditionCode: "THUNGFAERT",
        weightLimit: null,
        updated: "2026-10-23T06:08:05Z",
        changed: "2026-06-02T13:25:19Z",
      },
      {
        id: 911060037,
        name: "Breiðdalsheiði",
        fullName: "Axarvegur: Breiðdalsheiði",
        condition: "Easily passable",
        conditionCode: "GREIDFAERT",
        weightLimit: "Axle weight limit 7 tons",
        updated: "2026-10-23T07:00:00Z",
        changed: null,
      },
    ]);

    await roadConditions(new Request("http://localhost/x/roads/conditions"));
    assert.equal(fetchMock.urls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("roadWeather - maps roadside stations", async () => {
  const fetchMock = mockFetch({ vedur2014_1: { body: STATIONS } });
  try {
    const res = await roadWeather(
      new Request("http://localhost/x/roads/weather?pretty=true"),
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.deepEqual(JSON.parse(text), [
      {
        id: 30,
        name: "Breiðdalsheiði",
        latitude: 64.906967,
        longitude: -14.6035,
        elevation: 494,
        time: "2026-10-23T13:40:00Z",
        temperature: 0.945,
        roadTemperature: null,
        windSpeed: 2.508,
        windGust: 3.43,
        windDirection: "ESE",
        windDirectionDegrees: 102,
        humidity: 88.3,
        dewPoint: -0.773,
        traffic: { last10Minutes: 0, today: 11 },
      },
    ]);
  } finally {
    fetchMock.restore();
  }
});

test("roads - throws when Vegagerðin responds with an error", async () => {
  const fetchMock = mockFetch({ gagnaveita: { body: "down", status: 503 } });
  try {
    let thrown: unknown;
    try {
      await roadWeather(new Request("http://localhost/x/roads/weather"));
    } catch (error) {
      thrown = error;
    }
    assert.equal((thrown as Error).message, "Failed to fetch road data: 503");
  } finally {
    fetchMock.restore();
  }
});
