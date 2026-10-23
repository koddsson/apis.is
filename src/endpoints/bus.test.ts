import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { GTFS_ZIP, serveZip } from "../zip-fixture.test-helper.ts";
import { busRoutes, busStops } from "./bus.ts";

beforeEach(() => {
  clearCache();
});

test("busStops - lists stops from the GTFS zip", async () => {
  const server = serveZip(GTFS_ZIP);
  try {
    const res = await busStops(new Request("http://localhost/x/bus/stops"), {});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=86400");
    assert.deepEqual(await res.json(), [
      {
        id: "10000804",
        name: "Sunnuhlíð",
        latitude: 64.109082,
        longitude: -21.909596,
      },
      {
        id: "90000295",
        name: 'Hlemmur, "C"',
        latitude: 64.143,
        longitude: -21.915,
      },
    ]);
  } finally {
    server.restore();
  }
});

test("busStops - returns one stop or 404", async () => {
  const server = serveZip(GTFS_ZIP);
  try {
    const found = await busStops(
      new Request("http://localhost/x/bus/stops/90000295?pretty=true"),
      { id: "90000295" },
    );
    assert.equal(found.status, 200);
    const text = await found.text();
    assert.include(text, "\n");
    assert.equal(JSON.parse(text).name, 'Hlemmur, "C"');

    const missing = await busStops(
      new Request("http://localhost/x/bus/stops/1"),
      { id: "1" },
    );
    assert.equal(missing.status, 404);
  } finally {
    server.restore();
  }
});

test("busRoutes - lists routes and reuses the cached GTFS data", async () => {
  const server = serveZip(GTFS_ZIP);
  try {
    await busStops(new Request("http://localhost/x/bus/stops"), {});
    const requestsBefore = server.ranges.length;

    const res = await busRoutes(new Request("http://localhost/x/bus/routes"));
    assert.deepEqual(await res.json(), [
      {
        id: "1",
        number: "1",
        name: "Skúlagata <-> Hfj. Skarðshlíð",
        color: "#d32600",
      },
      { id: "57", number: "57", name: "Akureyri", color: null },
    ]);
    assert.equal(server.ranges.length, requestsBefore);
  } finally {
    server.restore();
  }
});
