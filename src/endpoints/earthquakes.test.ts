import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { clearCache } from "../cache.ts";
import earthquakes, { parseQuakes } from "./earthquakes.ts";

type Quake = ReturnType<typeof parseQuakes>[number];

const PAGE = `<script>
var VI; if (VI == undefined) VI = new Object(); VI.conf = { 'currMap':0, 'tabSize':0, 'infoDate':'23 Oct 13:30 GMT' }; VI.quakeInfo = [{'t':new Date(2026,10-1,23,12,31,33),'a':'0.97440','lat':'63.820','lon':'-22.768','dep':'6.6','s':'1.2','q':'99.0','dL':'3.8','dD':'NW','dR':'Reykjanestá'},{'t':new Date(2026,10-1,23,4,48,49),'a':'8.68654','lat':'65.027','lon':'-16.666','dep':'4.4','s':'0.1','q':'99.0','dL':'1.7','dD':'NE','dR':'Suðurbotnar'},{'t':new Date(2026,10-1,21,16,1,2),'a':'45.51341','lat':'64.010','lon':'-21.200','dep':'10.1','s':'3.4','q':'90.5','dL':'2.0','dD':'S','dR':'Hengill'}];
VI.quake.initQSubPage();
</script>`;

beforeEach(() => {
  clearCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T13:30:00Z"));
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

test("parseQuakes - reads the embedded quake list", () => {
  const quakes = parseQuakes(PAGE);

  assert.equal(quakes.length, 3);
  assert.deepEqual(quakes[0], {
    time: "2026-10-23T12:31:33.000Z",
    latitude: 63.82,
    longitude: -22.768,
    depth: 6.6,
    magnitude: 1.2,
    quality: 99,
    verified: false,
    place: "Reykjanestá",
    distance: 3.8,
    direction: "NW",
  });
  assert.equal(quakes[2].time, "2026-10-21T16:01:02.000Z");
});

test("parseQuakes - throws when the list is missing or malformed", () => {
  assert.throws(() => parseQuakes("<html></html>"), "not found");
  assert.throws(
    () => parseQuakes("VI.quakeInfo = [{'t':'yesterday'}];"),
    "Unexpected earthquake entry",
  );
});

test("earthquakes - returns the last 48 hours by default", async () => {
  const fetchMock = mockFetch(PAGE);
  try {
    const res = await earthquakes(
      new Request("http://localhost/x/earthquakes"),
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=120");
    assert.equal(
      fetchMock.urls[0],
      "https://en.vedur.is/earthquakes-and-volcanism/earthquakes",
    );
    const data = await res.json<Quake[]>();
    assert.deepEqual(
      data.map((quake) => quake.place),
      ["Reykjanestá", "Suðurbotnar", "Hengill"],
    );
  } finally {
    fetchMock.restore();
  }
});

test("earthquakes - filters by hours and min_magnitude", async () => {
  const fetchMock = mockFetch(PAGE);
  try {
    const recent = await earthquakes(
      new Request("http://localhost/x/earthquakes?hours=12"),
    );
    assert.deepEqual(
      (await recent.json<Quake[]>()).map((quake) => quake.place),
      ["Reykjanestá", "Suðurbotnar"],
    );

    const big = await earthquakes(
      new Request("http://localhost/x/earthquakes?min_magnitude=1"),
    );
    assert.deepEqual(
      (await big.json<Quake[]>()).map((quake) => quake.place),
      ["Reykjanestá", "Hengill"],
    );

    assert.equal(fetchMock.urls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("earthquakes - rejects invalid query parameters", async () => {
  for (const query of ["hours=0", "hours=49", "hours=abc", "hours="]) {
    const res = await earthquakes(
      new Request(`http://localhost/x/earthquakes?${query}`),
    );
    assert.equal(res.status, 400, query);
    assert.include((await res.json<{ error: string }>()).error, "hours");
  }

  const res = await earthquakes(
    new Request("http://localhost/x/earthquakes?min_magnitude=big"),
  );
  assert.equal(res.status, 400);
  assert.include((await res.json<{ error: string }>()).error, "min_magnitude");
});

test("earthquakes - throws when vedur.is responds with an error", async () => {
  const fetchMock = mockFetch("down", 503);
  try {
    let thrown: unknown;
    try {
      await earthquakes(new Request("http://localhost/x/earthquakes"));
    } catch (error) {
      thrown = error;
    }
    assert.instanceOf(thrown, Error);
    assert.equal((thrown as Error).message, "Failed to fetch earthquakes: 503");
  } finally {
    fetchMock.restore();
  }
});

test("earthquakes - health check accepts any list", () => {
  assert.isUndefined(earthquakes.health.check([]));
  assert.equal(earthquakes.health.check({}), "Expected an array");
});
