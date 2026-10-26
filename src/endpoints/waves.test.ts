import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import waves from "./waves.ts";

beforeEach(() => {
  clearCache();
});

function feature(
  coordinates: [number, number],
  properties: Record<string, unknown>,
) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: {
      PNT_X: 0,
      PNT_Y: 0,
      LAT: coordinates[1],
      LON: -coordinates[0],
      MA_BIRTA: 1,
      ...properties,
    },
  };
}

const BUOYS = {
  type: "FeatureCollection",
  features: [
    feature([-20.115127, 63.50890602], {
      IDDUFL: 14110,
      NAFN: "Landeyjahöfn, V",
      SKYRING: "1,05 sml. frá Landeyjahöfn",
      DYPI: 30,
      DAGS: "2026-10-26T12:19:59Z",
      KENNIALDA: 1.156,
      SVEIFLUTIMI: 7.799,
      OLDULENGD: 94.88606556,
      OLDUATT: 197.1,
      SJAVARHITI: null,
    }),
    feature([-21.28833332, 63.83833335], {
      IDDUFL: 14104,
      NAFN: "Þorlákshafnardufl",
      SKYRING: null,
      DYPI: 60,
      DAGS: "2026-10-26T11:30:00Z",
      KENNIALDA: 1.492,
      SVEIFLUTIMI: 7.475,
      OLDULENGD: 87.165975,
      OLDUATT: null,
      SJAVARHITI: 6.4,
    }),
    feature([-18, 63], {
      IDDUFL: 1,
      NAFN: "Unpublished",
      SKYRING: null,
      DYPI: null,
      MA_BIRTA: 0,
      DAGS: "2026-10-26T11:30:00Z",
      KENNIALDA: null,
      SVEIFLUTIMI: null,
      OLDULENGD: null,
      OLDUATT: null,
      SJAVARHITI: null,
    }),
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

test("waves - maps published buoys with coordinates from the geometry", async () => {
  const server = mockFetch(BUOYS);
  try {
    const res = await waves(new Request("http://localhost/x/waves"));
    const data = await res.json();
    assert.isUndefined(validate(waves.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=600");
    assert.include(server.requested[0], "typeName=gis:fa_dufl");
    assert.include(server.requested[0], "srsName=EPSG:4326");
    assert.deepEqual(data, [
      {
        id: 14110,
        name: "Landeyjahöfn, V",
        location: "1,05 sml. frá Landeyjahöfn",
        latitude: 63.50890602,
        longitude: -20.115127,
        depth: 30,
        time: "2026-10-26T12:19:59Z",
        waveHeight: 1.156,
        period: 7.799,
        wavelength: 94.88606556,
        direction: 197.1,
        seaTemperature: null,
      },
      {
        id: 14104,
        name: "Þorlákshafnardufl",
        location: null,
        latitude: 63.83833335,
        longitude: -21.28833332,
        depth: 60,
        time: "2026-10-26T11:30:00Z",
        waveHeight: 1.492,
        period: 7.475,
        wavelength: 87.165975,
        direction: null,
        seaTemperature: 6.4,
      },
    ]);
  } finally {
    server.restore();
  }
});

test("waves - filters by buoy and 404s unknown ones", async () => {
  const server = mockFetch(BUOYS);
  try {
    const one = await waves(
      new Request("http://localhost/x/waves?buoy=14104&pretty=true"),
    );
    const text = await one.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((buoy: { name: string }) => buoy.name),
      ["Þorlákshafnardufl"],
    );

    const hidden = await waves(new Request("http://localhost/x/waves?buoy=1"));
    assert.equal(hidden.status, 404);
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("waves - throws when Vegagerðin responds with an error", async () => {
  const server = mockFetch({}, 503);
  try {
    await waves(new Request("http://localhost/x/waves")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});
