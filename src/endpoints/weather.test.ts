import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import weather from "./weather.ts";

const STATIONS = [
  {
    station: 1,
    name: "Reykjavík",
    abbr: "rvk",
    type: "sk",
    lat: 64.1288833618,
    lon: -21.9081897736,
    ele: 60.2000007629,
    owner: "Veðurstofa Íslands",
    start: 1920,
    ending: null,
  },
  {
    station: 4,
    name: "Reykjavík S",
    lat: 64.12,
    lon: -21.9,
    ele: 52,
    owner: "Veðurstofa Íslands",
    start: 2015,
    ending: 2024,
  },
];

const OBSERVATION = `<?xml version="1.0" encoding="UTF-8"?>
<observations><station id="31392"  valid="1"><name>Hellisheiði</name><time>2026-10-23 13:00:00</time><err></err><link><![CDATA[http://en.vedur.is/weather/observations/areas/faxafloi/#group=11&station=31392]]></link><F>1</F><D>ESE</D><FX>1</FX><FG>2</FG><T>0.6</T><W></W><V></V><R></R></station></observations>`;

const FORECAST = `<?xml version="1.0" encoding="UTF-8"?>
<forecasts><station id="31392"  valid="1"><name>Hellisheiði</name><atime>2026-10-23 09:00:00</atime><err></err><link><![CDATA[http://en.vedur.is/weather/forecasts/areas/faxafloi/#group=11&station=31392]]></link><forecast><ftime>2026-10-23 10:00:00</ftime><F>3</F><D>E</D><T>1</T><W>Cloudy</W></forecast><forecast><ftime>2026-10-23 11:00:00</ftime><F>2</F><D>ENE</D><T>-2</T><W>Partly cloudy</W></forecast></station></forecasts>`;

const EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<observations></observations>`;

beforeEach(() => {
  clearCache();
});

function mockFetch(routes: Record<string, { body: string; status?: number }>) {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = input.toString();
    urls.push(url);
    const route = Object.entries(routes).find(([match]) => url.includes(match));
    if (!route) throw new Error(`Unexpected fetch ${url}`);
    return Promise.resolve(
      new Response(route[1].body, { status: route[1].status ?? 200 }),
    );
  };
  return { urls, restore: () => (globalThis.fetch = originalFetch) };
}

function get(path: string, station?: string) {
  return weather(
    new Request(`http://localhost${path}`),
    station ? { station } : {},
  );
}

test("weather - lists active stations", async () => {
  const fetchMock = mockFetch({
    "api.vedur.is/weather/stations": { body: JSON.stringify(STATIONS) },
  });
  try {
    const res = await get("/x/weather");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=86400");
    assert.deepEqual(await res.json(), [
      {
        id: 1,
        name: "Reykjavík",
        latitude: 64.1288833618,
        longitude: -21.9081897736,
        elevation: 60.2000007629,
        owner: "Veðurstofa Íslands",
      },
    ]);
  } finally {
    fetchMock.restore();
  }
});

test("weather - returns the latest observation for a station", async () => {
  const fetchMock = mockFetch({ "type=obs": { body: OBSERVATION } });
  try {
    const res = await get("/x/weather/31392", "31392");
    assert.isUndefined(
      validate(weather.health.schema, await res.clone().json()),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=600");
    assert.include(fetchMock.urls[0], "ids=31392");
    assert.deepEqual(await res.json(), {
      id: 31392,
      name: "Hellisheiði",
      time: "2026-10-23T13:00:00Z",
      temperature: 0.6,
      windSpeed: 1,
      windDirection: "ESE",
      windSpeedMax: 1,
      windGust: 2,
      precipitation: null,
      visibility: null,
      weather: null,
      link: "http://en.vedur.is/weather/observations/areas/faxafloi/#group=11&station=31392",
    });

    await get("/x/weather/31392", "31392");
    assert.equal(fetchMock.urls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("weather - includes the forecast when asked", async () => {
  const fetchMock = mockFetch({
    "type=obs": { body: OBSERVATION },
    "type=forec": { body: FORECAST },
  });
  try {
    const res = await get("/x/weather/31392?forecast=true", "31392");
    const data = await res.json<{ forecast: unknown[] }>();
    assert.deepEqual(data.forecast, [
      {
        time: "2026-10-23T10:00:00Z",
        temperature: 1,
        windSpeed: 3,
        windDirection: "E",
        weather: "Cloudy",
      },
      {
        time: "2026-10-23T11:00:00Z",
        temperature: -2,
        windSpeed: 2,
        windDirection: "ENE",
        weather: "Partly cloudy",
      },
    ]);
  } finally {
    fetchMock.restore();
  }
});

test("weather - returns an empty forecast when there is none", async () => {
  const fetchMock = mockFetch({
    "type=obs": { body: OBSERVATION },
    "type=forec": {
      body: '<?xml version="1.0"?><forecasts></forecasts>',
    },
  });
  try {
    const res = await get("/x/weather/31392?forecast=true", "31392");
    assert.deepEqual((await res.json<{ forecast: unknown[] }>()).forecast, []);
  } finally {
    fetchMock.restore();
  }
});

test("weather - returns a null time when the station has none", async () => {
  const fetchMock = mockFetch({
    "type=obs": {
      body: OBSERVATION.replace(/<time>.*<\/time>/, "<time></time>"),
    },
  });
  try {
    const res = await get("/x/weather/31392", "31392");
    assert.isNull((await res.json<{ time: string | null }>()).time);
  } finally {
    fetchMock.restore();
  }
});

test("weather - rejects bad and unknown stations", async () => {
  const fetchMock = mockFetch({ "type=obs": { body: EMPTY } });
  try {
    const bad = await get("/x/weather/abc", "abc");
    assert.equal(bad.status, 400);

    const unknown = await get("/x/weather/999999", "999999");
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), {
      error: "Unknown station 999999",
    });
  } finally {
    fetchMock.restore();
  }
});

test("weather - throws when Veðurstofa responds with an error", async () => {
  const fetchMock = mockFetch({
    "api.vedur.is": { body: "down", status: 503 },
    xmlweather: { body: "down", status: 502 },
  });
  try {
    for (const [path, station, message] of [
      ["/x/weather", undefined, "Failed to fetch stations: 503"],
      ["/x/weather/1", "1", "Failed to fetch weather: 502"],
    ] as const) {
      let thrown: unknown;
      try {
        await get(path, station);
      } catch (error) {
        thrown = error;
      }
      assert.equal((thrown as Error).message, message);
    }
  } finally {
    fetchMock.restore();
  }
});

test("weather - health schema requires an observation", () => {
  assert.include(validate(weather.health.schema, null) ?? "", "(root)");
});
