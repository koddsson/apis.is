import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import roadIncidents from "./road-incidents.ts";

beforeEach(() => {
  clearCache();
});

function feature(
  coordinates: [number, number],
  properties: Record<string, unknown>,
) {
  return {
    type: "Feature",
    id: "roadconditions_pointincident.fid-6befbb0d_1a179d2cb09_1bd0",
    geometry: { type: "Point", coordinates },
    geometry_name: "SHAPE",
    properties: {
      CREATIONTIME: "2026-10-26T20:11:00Z",
      X: Number(coordinates[0].toFixed(6)),
      Y: Number(coordinates[1].toFixed(6)),
      ...properties,
    },
  };
}

const INCIDENTS = {
  type: "FeatureCollection",
  features: [
    feature([-21.8386242, 64.08898126], {
      DESCRIPTION: "Road repairs",
      STARTTIME: "2026-08-30T19:31:33Z",
      STOPTIME: "2026-10-31T16:00:00Z",
      ASTAND: "VEGAVINNA",
    }),
    feature([-17.452407, 65.496134], {
      DESCRIPTION: "Closed",
      STARTTIME: "2026-09-18T07:32:53Z",
      STOPTIME: "2026-12-01T14:38:00Z",
      ASTAND: "ALLUR_AKSTUR_BANN",
    }),
    feature([-19.003369, 66.166311], {
      DESCRIPTION: "Risk of falling rocks",
      STARTTIME: "2026-10-25T20:37:26Z",
      STOPTIME: null,
      ASTAND: "GRJOTHRUN",
    }),
    feature([-20, 64], {
      DESCRIPTION: "Snow drift",
      STARTTIME: "2026-10-26T08:00:00Z",
      STOPTIME: "2026-10-27T08:00:00Z",
      ASTAND: "SKAFRENNINGUR",
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

test("roadIncidents - maps incidents to types with WGS84 coordinates", async () => {
  const server = mockFetch(INCIDENTS);
  try {
    const res = await roadIncidents(
      new Request("http://localhost/x/roads/incidents"),
    );
    const data = await res.json();
    assert.isUndefined(validate(roadIncidents.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
    assert.include(
      server.requested[0],
      "typeName=gis:roadconditions_pointincident",
    );
    assert.include(server.requested[0], "srsName=EPSG:4326");
    assert.deepEqual(data, [
      {
        type: "roadworks",
        description: "Road repairs",
        latitude: 64.08898126,
        longitude: -21.8386242,
        start: "2026-08-30T19:31:33Z",
        end: "2026-10-31T16:00:00Z",
      },
      {
        type: "closed",
        description: "Closed",
        latitude: 65.496134,
        longitude: -17.452407,
        start: "2026-09-18T07:32:53Z",
        end: "2026-12-01T14:38:00Z",
      },
      {
        type: "rockfall",
        description: "Risk of falling rocks",
        latitude: 66.166311,
        longitude: -19.003369,
        start: "2026-10-25T20:37:26Z",
        end: null,
      },
      {
        type: "skafrenningur",
        description: "Snow drift",
        latitude: 64,
        longitude: -20,
        start: "2026-10-26T08:00:00Z",
        end: "2026-10-27T08:00:00Z",
      },
    ]);
  } finally {
    server.restore();
  }
});

test("roadIncidents - filters by type and rejects unknown types", async () => {
  const server = mockFetch(INCIDENTS);
  try {
    const closed = await roadIncidents(
      new Request("http://localhost/x/roads/incidents?type=closed&pretty=true"),
    );
    const text = await closed.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((incident: { type: string }) => incident.type),
      ["closed"],
    );

    const potholes = await roadIncidents(
      new Request("http://localhost/x/roads/incidents?type=potholes"),
    );
    assert.deepEqual(await potholes.json(), []);

    const unknown = await roadIncidents(
      new Request("http://localhost/x/roads/incidents?type=snow"),
    );
    assert.equal(unknown.status, 400);
    const { error } = await unknown.json<{ error: string }>();
    assert.include(error, "roadworks");
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("roadIncidents - throws when Vegagerðin responds with an error", async () => {
  const server = mockFetch({}, 503);
  try {
    await roadIncidents(new Request("http://localhost/x/roads/incidents")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});

test("roadIncidents - throws when the response has no features", async () => {
  const server = mockFetch({ type: "ServiceExceptionReport" });
  try {
    await roadIncidents(new Request("http://localhost/x/roads/incidents")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "Unexpected"),
    );
  } finally {
    server.restore();
  }
});
