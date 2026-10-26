import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import roadCameras from "./road-cameras.ts";

beforeEach(() => {
  clearCache();
});

function feature(
  objectId: number,
  coordinates: [number, number],
  properties: Record<string, unknown>,
) {
  return {
    type: "Feature",
    id: `vefmyndavel_2024_1.${objectId}`,
    geometry: { type: "Point", coordinates },
    geometry_name: "SHAPE",
    properties: {
      OBJECTID: objectId,
      HNIT_X: 443049.6,
      HNIT_Y: 574894.1,
      NOTKUNARSVID: "V",
      ...properties,
    },
  };
}

const BLONDUOS = {
  MAELIST_NR: 7097,
  MYNDAVEL: "Blönduós",
  VEGNR: "1",
  VEGHEITI: "Hringvegur",
};

const SAUDARKROKUR = {
  MAELIST_NR: 7150,
  MYNDAVEL: "Sauðárkrókur",
  VEGNR: null,
  VEGHEITI: null,
  NOTKUNARSVID: "A",
};

const CAMERAS = {
  type: "FeatureCollection",
  features: [
    feature(322, [-19.6222498, 65.74291668], {
      ...SAUDARKROKUR,
      SKYRING: "Sauðárkrókur séð til norðurs að Þórðarhöfða",
      SLOD: "https://www.vegagerdin.is/vgdata/vefmyndavelar/saudarkrokur_1.jpg",
      ROD: 1,
    }),
    feature(313, [-20.23824967, 65.66675011], {
      ...BLONDUOS,
      SKYRING: "Blönduós til suðurs",
      SLOD: "https://www.vegagerdin.is/vgdata/vefmyndavelar/blonduos_3.jpg",
      ROD: 3,
    }),
    feature(312, [-20.23824967, 65.66675011], {
      ...BLONDUOS,
      SKYRING: "Blönduós niður á veg",
      SLOD: "https://www.vegagerdin.is/vgdata/vefmyndavelar/blonduos_2.jpg",
      ROD: 2,
    }),
    feature(400, [-18.5, 64.9], {
      MAELIST_NR: 7200,
      MYNDAVEL: "Vífilsstaðavegur",
      VEGNR: "F43/411",
      VEGHEITI: "Vífilsstaðavegur",
      SKYRING: null,
      SLOD: "https://www.vegagerdin.is/vgdata/vefmyndavelar/vifilsstadavegur_1.jpg",
      ROD: 1,
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

test("roadCameras - groups images per camera in order", async () => {
  const server = mockFetch(CAMERAS);
  try {
    const res = await roadCameras(
      new Request("http://localhost/x/roads/cameras"),
    );
    const data = await res.json();
    assert.isUndefined(validate(roadCameras.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
    assert.include(server.requested[0], "typeName=gis:vefmyndavel_2024_1");
    assert.include(server.requested[0], "srsName=EPSG:4326");
    assert.deepEqual(data, [
      {
        id: 7097,
        name: "Blönduós",
        road: "1",
        roadName: "Hringvegur",
        latitude: 65.66675011,
        longitude: -20.23824967,
        images: [
          {
            description: "Blönduós niður á veg",
            url: "https://www.vegagerdin.is/vgdata/vefmyndavelar/blonduos_2.jpg",
          },
          {
            description: "Blönduós til suðurs",
            url: "https://www.vegagerdin.is/vgdata/vefmyndavelar/blonduos_3.jpg",
          },
        ],
      },
      {
        id: 7150,
        name: "Sauðárkrókur",
        road: null,
        roadName: null,
        latitude: 65.74291668,
        longitude: -19.6222498,
        images: [
          {
            description: "Sauðárkrókur séð til norðurs að Þórðarhöfða",
            url: "https://www.vegagerdin.is/vgdata/vefmyndavelar/saudarkrokur_1.jpg",
          },
        ],
      },
      {
        id: 7200,
        name: "Vífilsstaðavegur",
        road: "F43/411",
        roadName: "Vífilsstaðavegur",
        latitude: 64.9,
        longitude: -18.5,
        images: [
          {
            description: null,
            url: "https://www.vegagerdin.is/vgdata/vefmyndavelar/vifilsstadavegur_1.jpg",
          },
        ],
      },
    ]);
  } finally {
    server.restore();
  }
});

test("roadCameras - filters by road and 404s roads without cameras", async () => {
  const server = mockFetch(CAMERAS);
  try {
    const junction = await roadCameras(
      new Request("http://localhost/x/roads/cameras?road=f43&pretty=true"),
    );
    const text = await junction.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((camera: { name: string }) => camera.name),
      ["Vífilsstaðavegur"],
    );

    const other = await roadCameras(
      new Request("http://localhost/x/roads/cameras?road=411"),
    );
    assert.equal((await other.json<unknown[]>()).length, 1);

    const none = await roadCameras(
      new Request("http://localhost/x/roads/cameras?road=999"),
    );
    assert.equal(none.status, 404);
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("roadCameras - throws when Vegagerðin responds with an error", async () => {
  const server = mockFetch({}, 503);
  try {
    await roadCameras(new Request("http://localhost/x/roads/cameras")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});

test("roadCameras - throws when the response has no features", async () => {
  const server = mockFetch({ type: "ServiceExceptionReport" });
  try {
    await roadCameras(new Request("http://localhost/x/roads/cameras")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "Unexpected"),
    );
  } finally {
    server.restore();
  }
});
