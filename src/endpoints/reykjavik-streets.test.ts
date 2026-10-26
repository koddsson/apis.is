import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import { reykjavikTraffic, streetClosures } from "./reykjavik-streets.ts";

beforeEach(() => {
  clearCache();
});

function segment(
  OBJECTID: number,
  NAFNFITJU: string,
  LEVELOFSERVICE: number,
  DAGSTIMI: number,
) {
  return {
    attributes: { OBJECTID, NAFNFITJU, LEVELOFSERVICE, DAGSTIMI },
    geometry: {
      paths: [
        [
          [-21.859695955865856, 64.10621010446198],
          [-21.856834456005235, 64.10636004408256],
        ],
      ],
    },
  };
}

const CONGESTION = {
  displayFieldName: "NAFNFITJU",
  geometryType: "esriGeometryPolyline",
  spatialReference: { wkid: 4326, latestWkid: 4326 },
  features: [
    segment(308, "Dalvegur", 0, 1793045431000),
    segment(314, "Reykjanesbraut", 2, 1793045431000),
    segment(321, "Reykjanesbraut", 5, 1793045431000),
    segment(328, "Bústaðavegur", 0, 1590575311000),
  ],
};

function link(
  OBJECTID: number,
  LINK_ID: number | null,
  paths: [number, number][][],
  attributes: Record<string, unknown> = {},
) {
  return {
    attributes: {
      OBJECTID,
      ID: "1780560528594",
      UPPHAF: 1793523600000,
      ENDIR: 1793552400000,
      TITILL: "Fræsing Langholtsvegur",
      LYSING: "Colas fræsir fyrir Reykjavíkurborg.\nNánari dagsetnign síðar",
      LOKUN: "Akbraut lokuð",
      SVEITARFELAG: "Reykjavík",
      POSTNR: null,
      LINK_ID,
      URL: null,
      NAFN: null,
      VERKSTADA: "Framundan",
      "SHAPE.LEN": 75.6327399586566,
      ...attributes,
    },
    geometry: { paths },
  };
}

const LANGHOLTSVEGUR_A: [number, number][][] = [
  [
    [-21.859687308611683, 64.1391691281763],
    [-21.8583038638704, 64.13947762897604],
  ],
];
const LANGHOLTSVEGUR_B: [number, number][][] = [
  [
    [-21.861019787270752, 64.14054499065139],
    [-21.859687308611683, 64.1391691281763],
  ],
];
const SKEIDARVOGUR: [number, number][][] = [
  [
    [-21.86443743918438, 64.12679372418827],
    [-21.86508517078872, 64.1269],
  ],
];
const ULFARSBRAUT: [number, number][][] = [
  [
    [-21.74003820886531, 64.13322663790413],
    [-21.737894191579937, 64.1330118581147],
  ],
];

const SKEIDARVOGUR_CLOSURE = {
  ID: "1789985701591",
  UPPHAF: 1793516400000,
  ENDIR: 1793534400000,
  TITILL: "Fræsing - Skeiðarvogur, SV-Slaufa ",
  LYSING: "Colas fræsir fyrir Reykjavíkurborg",
  LOKUN: "Akbraut þrengd",
  VERKSTADA: "Í gangi",
  URL: "https://reykjavik.is/framkvaemdir",
};

const ULFARSBRAUT_CLOSURE = {
  ID: "1787911165495",
  UPPHAF: null,
  ENDIR: 1793545200000,
  TITILL: "Fræsing og malbikun - Úlfarsbraut",
  LYSING: null,
  SVEITARFELAG: null,
  VERKSTADA: "Lokið",
};

const CLOSURES = {
  displayFieldName: "TITILL",
  geometryType: "esriGeometryPolyline",
  features: [
    link(55104, 1000016, LANGHOLTSVEGUR_A),
    link(55105, 1000334, LANGHOLTSVEGUR_B),
    link(55108, 1000016, LANGHOLTSVEGUR_A),
    link(55109, 1000334, LANGHOLTSVEGUR_B),
    link(55473, 1001772, SKEIDARVOGUR, SKEIDARVOGUR_CLOSURE),
    link(54785, null, ULFARSBRAUT, ULFARSBRAUT_CLOSURE),
    link(54786, null, ULFARSBRAUT, ULFARSBRAUT_CLOSURE),
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

async function rejects(promise: Promise<unknown>, message: string) {
  await promise.then(
    () => assert.fail("expected an error"),
    (error: Error) => assert.include(error.message, message),
  );
}

test("reykjavikTraffic - maps segments with congestion levels and GeoJSON lines", async () => {
  const server = mockFetch(CONGESTION);
  try {
    const res = await reykjavikTraffic(
      new Request("http://localhost/x/traffic/reykjavik"),
    );
    const data = await res.json();
    assert.isUndefined(validate(reykjavikTraffic.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=90");
    assert.include(server.requested[0], "LifandiGogn/MapServer/0/query");
    assert.include(server.requested[0], "outSR=4326");
    const geometry = {
      type: "MultiLineString",
      coordinates: [
        [
          [-21.859695955865856, 64.10621010446198],
          [-21.856834456005235, 64.10636004408256],
        ],
      ],
    };
    assert.deepEqual(data, [
      {
        id: 308,
        road: "Dalvegur",
        level: 0,
        congestion: "free",
        updated: "2026-10-26T20:10:31.000Z",
        geometry,
      },
      {
        id: 314,
        road: "Reykjanesbraut",
        level: 2,
        congestion: "slow",
        updated: "2026-10-26T20:10:31.000Z",
        geometry,
      },
      {
        id: 321,
        road: "Reykjanesbraut",
        level: null,
        congestion: "unknown",
        updated: "2026-10-26T20:10:31.000Z",
        geometry,
      },
      {
        id: 328,
        road: "Bústaðavegur",
        level: 0,
        congestion: "free",
        updated: "2020-05-27T10:28:31.000Z",
        geometry,
      },
    ]);
  } finally {
    server.restore();
  }
});

test("reykjavikTraffic - filters by road name and 404s unknown roads", async () => {
  const server = mockFetch(CONGESTION);
  try {
    const res = await reykjavikTraffic(
      new Request(
        "http://localhost/x/traffic/reykjavik?road=reykjanesbraut&pretty=true",
      ),
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((s: { id: number }) => s.id),
      [314, 321],
    );

    const unknown = await reykjavikTraffic(
      new Request("http://localhost/x/traffic/reykjavik?road=Laugavegur"),
    );
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), {
      error: "Unknown road Laugavegur",
    });
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("reykjavikTraffic - throws on unknown levels of service", async () => {
  const server = mockFetch({
    features: [segment(1, "Sæbraut", 7, 1793045431000)],
  });
  try {
    await rejects(
      reykjavikTraffic(new Request("http://localhost/x/traffic/reykjavik")),
      "Unknown level of service 7",
    );
  } finally {
    server.restore();
  }
});

test("reykjavikTraffic - throws when the server responds with an error", async () => {
  const server = mockFetch({}, 503);
  try {
    await rejects(
      reykjavikTraffic(new Request("http://localhost/x/traffic/reykjavik")),
      "503",
    );
  } finally {
    server.restore();
  }
});

test("reykjavikTraffic - throws on ArcGIS error bodies", async () => {
  const server = mockFetch({
    error: { code: 400, message: "Invalid or missing input parameters." },
  });
  try {
    await rejects(
      reykjavikTraffic(new Request("http://localhost/x/traffic/reykjavik")),
      "Invalid or missing input parameters.",
    );
  } finally {
    server.restore();
  }
});

test("streetClosures - groups links into deduplicated closures", async () => {
  const server = mockFetch(CLOSURES);
  try {
    const res = await streetClosures(
      new Request("http://localhost/x/roads/closures"),
    );
    const data = await res.json();
    assert.isUndefined(validate(streetClosures.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=900");
    assert.include(server.requested[0], "Framkvaemdakort/MapServer/0/query");
    assert.include(server.requested[0], "where=ENDIR%3ECURRENT_TIMESTAMP");
    assert.deepEqual(data, [
      {
        id: "1789985701591",
        title: "Fræsing - Skeiðarvogur, SV-Slaufa",
        description: "Colas fræsir fyrir Reykjavíkurborg",
        type: "narrowed",
        status: "in-progress",
        start: "2026-11-01T07:00:00.000Z",
        end: "2026-11-01T12:00:00.000Z",
        municipality: "Reykjavík",
        url: "https://reykjavik.is/framkvaemdir",
        geometry: { type: "MultiLineString", coordinates: SKEIDARVOGUR },
      },
      {
        id: "1780560528594",
        title: "Fræsing Langholtsvegur",
        description:
          "Colas fræsir fyrir Reykjavíkurborg.\nNánari dagsetnign síðar",
        type: "closed",
        status: "upcoming",
        start: "2026-11-01T09:00:00.000Z",
        end: "2026-11-01T17:00:00.000Z",
        municipality: "Reykjavík",
        url: null,
        geometry: {
          type: "MultiLineString",
          coordinates: [...LANGHOLTSVEGUR_A, ...LANGHOLTSVEGUR_B],
        },
      },
      {
        id: "1787911165495",
        title: "Fræsing og malbikun - Úlfarsbraut",
        description: null,
        type: "closed",
        status: "finished",
        start: null,
        end: "2026-11-01T15:00:00.000Z",
        municipality: null,
        url: null,
        geometry: {
          type: "MultiLineString",
          coordinates: [...ULFARSBRAUT, ...ULFARSBRAUT],
        },
      },
    ]);
  } finally {
    server.restore();
  }
});

test("streetClosures - filters by status and rejects unknown ones", async () => {
  const server = mockFetch(CLOSURES);
  try {
    const res = await streetClosures(
      new Request(
        "http://localhost/x/roads/closures?status=upcoming&pretty=true",
      ),
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((c: { id: string }) => c.id),
      ["1780560528594"],
    );

    const invalid = await streetClosures(
      new Request("http://localhost/x/roads/closures?status=open"),
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      error: "status must be one of in-progress, upcoming, finished",
    });
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("streetClosures - throws on unknown closure types and statuses", async () => {
  const unknownType = mockFetch({
    features: [link(1, 1, ULFARSBRAUT, { LOKUN: "Gangstétt lokuð" })],
  });
  try {
    await rejects(
      streetClosures(new Request("http://localhost/x/roads/closures")),
      'Unknown closure type "Gangstétt lokuð"',
    );
  } finally {
    unknownType.restore();
  }

  clearCache();
  const unknownStatus = mockFetch({
    features: [link(1, 1, ULFARSBRAUT, { VERKSTADA: "Frestað" })],
  });
  try {
    await rejects(
      streetClosures(new Request("http://localhost/x/roads/closures")),
      'Unknown closure status "Frestað"',
    );
  } finally {
    unknownStatus.restore();
  }
});

test("streetClosures - throws when the response has no features", async () => {
  const server = mockFetch({});
  try {
    await rejects(
      streetClosures(new Request("http://localhost/x/roads/closures")),
      "no features",
    );
  } finally {
    server.restore();
  }
});
