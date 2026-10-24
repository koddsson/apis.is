import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import { GTFS_ZIP, serveZip } from "../zip-fixture.test-helper.ts";
import { busRoutes, busStops, busVehicles, liveTime } from "./bus.ts";

beforeEach(() => {
  clearCache();
});

const VEHICLES = {
  sent: "2026-10-24 23:58:00",
  leidir: [
    {
      leid: "1",
      ferlar: [
        {
          ferill: "1",
          vagn: "UO-J86",
          lat: 64.143,
          lon: -21.915,
          head: 135.72,
          last_stopnum: "90000295",
          last_stopname: 'Hlemmur, "C"',
          next_stopnum: "10000804",
          next_stopname: "Sunnuhlíð",
          komur: [
            {
              stopp: "10000804",
              heiti: "Sunnuhlíð",
              til: "Hfj. Skarðshlíð",
              koma: "23:59",
              sched: "23:58",
              tripid: "86106",
              teg: 0,
            },
            {
              stopp: "10000805",
              heiti: "Hamraborg",
              til: "Hfj. Skarðshlíð",
              koma: "00:03",
              sched: "00:02",
              tripid: "86106",
              teg: 1,
            },
          ],
        },
      ],
    },
    {
      leid: "57",
      ferlar: [
        {
          ferill: "57",
          vagn: "AB-123",
          lat: 64.5,
          lon: -21.8,
          head: 10,
          last_stopnum: "1",
          last_stopname: "Borgarnes",
          next_stopnum: "2",
          next_stopname: "Akureyri",
          komur: [],
        },
      ],
    },
  ],
};

const HLEMMUR_ARRIVALS = {
  sent: "2026-10-24 18:54:03",
  feeds: [
    {
      stop_name: 'Hlemmur, "C"',
      stop_id: "90000295",
      arrivals: [
        {
          wait: "14",
          lat: 64.111,
          lon: -21.866,
          route: "1",
          vehicle: "222",
          to: "Hfj. Skarðshlíð",
          arrival: "19:08",
        },
        {
          wait: "73",
          lat: null,
          lon: null,
          route: "1",
          vehicle: "",
          to: "Hfj. Skarðshlíð",
          arrival: "20:08",
        },
      ],
    },
  ],
};

// Serves live files by their path under dyn-data/, 404s unknown ones, and
// sends everything else to the GTFS zip.
function serveLive(files: Record<string, unknown>) {
  const zip = serveZip(GTFS_ZIP);
  const zipFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const path = input.toString().split("/dyn-data/")[1];
    if (path === undefined) return zipFetch(input, init);
    requested.push(path);
    const body = files[path];
    if (body instanceof Response) return Promise.resolve(body);
    return Promise.resolve(
      body === undefined
        ? new Response("Not Found", { status: 404 })
        : new Response(JSON.stringify(body)),
    );
  };
  return { requested, restore: zip.restore };
}

test("liveTime - dates HH:MM by the feed's sent time", () => {
  assert.equal(
    liveTime("19:08", "2026-10-24 18:54:03"),
    "2026-10-24T19:08:00.000Z",
  );
  assert.equal(
    liveTime("00:03", "2026-10-24 23:58:00"),
    "2026-10-25T00:03:00.000Z",
  );
  assert.equal(
    liveTime("23:58", "2026-10-25 00:02:00"),
    "2026-10-24T23:58:00.000Z",
  );
});

test("busStops - lists stops from the GTFS zip", async () => {
  const server = serveZip(GTFS_ZIP);
  try {
    const res = await busStops(new Request("http://localhost/x/bus/stops"), {});
    assert.isUndefined(
      validate(busStops.health.schema, await res.clone().json()),
    );
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
  const server = serveLive({});
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
    assert.isUndefined(
      validate(busRoutes.health.schema, await res.clone().json()),
    );
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

test("busStops - includes live arrivals for one stop", async () => {
  const server = serveLive({ "nl/90000295.json": HLEMMUR_ARRIVALS });
  try {
    const res = await busStops(
      new Request("http://localhost/x/bus/stops/90000295"),
      { id: "90000295" },
    );
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=30");
    assert.deepEqual(await res.json(), {
      id: "90000295",
      name: 'Hlemmur, "C"',
      latitude: 64.143,
      longitude: -21.915,
      arrivals: [
        {
          route: "1",
          destination: "Hfj. Skarðshlíð",
          arrival: "2026-10-24T19:08:00.000Z",
          minutes: 14,
          vehicle: "222",
          latitude: 64.111,
          longitude: -21.866,
        },
        {
          route: "1",
          destination: "Hfj. Skarðshlíð",
          arrival: "2026-10-24T20:08:00.000Z",
          minutes: 73,
          vehicle: null,
          latitude: null,
          longitude: null,
        },
      ],
    });
  } finally {
    server.restore();
  }
});

test("busStops - has no arrivals when the stop has no live data", async () => {
  const server = serveLive({
    "nl/90000295.json": { sent: "2026-10-24 18:54:03", feeds: [] },
  });
  try {
    for (const id of ["10000804", "90000295"]) {
      const res = await busStops(
        new Request(`http://localhost/x/bus/stops/${id}`),
        { id },
      );
      const data = await res.json<{ arrivals: unknown[] }>();
      assert.deepEqual(data.arrivals, [], id);
    }
    assert.deepEqual(server.requested, [
      "nl/10000804.json",
      "nl/90000295.json",
    ]);
  } finally {
    server.restore();
  }
});

test("busVehicles - maps live positions and upcoming stops", async () => {
  const server = serveLive({ "vagnar-all.json": VEHICLES });
  try {
    const res = await busVehicles(
      new Request("http://localhost/x/bus/vehicles"),
    );
    const data = await res.json<Array<Record<string, unknown>>>();
    assert.isUndefined(validate(busVehicles.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=30");
    assert.deepEqual(data[0], {
      route: "1",
      vehicle: "UO-J86",
      latitude: 64.143,
      longitude: -21.915,
      heading: 135.72,
      lastStop: { id: "90000295", name: 'Hlemmur, "C"' },
      nextStop: { id: "10000804", name: "Sunnuhlíð" },
      arrivals: [
        {
          stop: { id: "10000804", name: "Sunnuhlíð" },
          destination: "Hfj. Skarðshlíð",
          scheduled: "2026-10-24T23:58:00.000Z",
          predicted: "2026-10-24T23:59:00.000Z",
        },
        {
          stop: { id: "10000805", name: "Hamraborg" },
          destination: "Hfj. Skarðshlíð",
          scheduled: "2026-10-25T00:02:00.000Z",
          predicted: "2026-10-25T00:03:00.000Z",
        },
      ],
    });
    assert.deepEqual(
      data.map((bus) => bus.route),
      ["1", "57"],
    );
  } finally {
    server.restore();
  }
});

test("busVehicles - filters by route and reuses cached positions", async () => {
  const server = serveLive({ "vagnar-all.json": VEHICLES });
  try {
    await busVehicles(new Request("http://localhost/x/bus/vehicles"));
    const res = await busVehicles(
      new Request("http://localhost/x/bus/vehicles?route=57"),
    );
    assert.deepEqual(
      (await res.json<Array<{ vehicle: string }>>()).map((bus) => bus.vehicle),
      ["AB-123"],
    );
    assert.deepEqual(server.requested, ["vagnar-all.json"]);
  } finally {
    server.restore();
  }
});

test("busVehicles - throws when the live feed is missing or failing", async () => {
  const missing = serveLive({});
  try {
    await busVehicles(new Request("http://localhost/x/bus/vehicles")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "not found"),
    );
  } finally {
    missing.restore();
  }

  clearCache();
  const failing = serveLive({
    "vagnar-all.json": new Response("", { status: 503 }),
  });
  try {
    await busVehicles(new Request("http://localhost/x/bus/vehicles")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    failing.restore();
  }
});
