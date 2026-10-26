import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import uv from "./uv.ts";

beforeEach(() => {
  clearCache();
});

const KEY =
  "icelandicRadiationSafetyAuthority.ultravioletRadiation.measurementSeriesPast72Hours";

function point(header: string, value: number) {
  return { header, statisticsForHeader: [{ key: KEY, value }] };
}

const SERIES = {
  data: {
    getStatisticsByKeys: {
      statistics: [
        point("1792837554000", 0.6),
        point("1792839963000", 0.7),
        point("1793044350000", 0),
        point("1792786050000", 0),
      ],
    },
  },
};

function mockFetch(body: unknown, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: Request[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    requested.push(new Request(input, init));
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

test("uv - returns the latest measurement and the sorted 72-hour series", async () => {
  const server = mockFetch(SERIES);
  try {
    const res = await uv(new Request("http://localhost/x/uv"));
    const data = await res.json();
    assert.isUndefined(validate(uv.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=600");
    assert.deepEqual(data, {
      location: "Rauðarárstígur, Reykjavík",
      latest: { time: "2026-10-26T19:52:30.000Z", uvIndex: 0 },
      past72Hours: [
        { time: "2026-10-23T20:07:30.000Z", uvIndex: 0 },
        { time: "2026-10-24T10:25:54.000Z", uvIndex: 0.6 },
        { time: "2026-10-24T11:06:03.000Z", uvIndex: 0.7 },
        { time: "2026-10-26T19:52:30.000Z", uvIndex: 0 },
      ],
    });

    const [request] = server.requested;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://island.is/api/graphql");
    const body = await request.json<{
      variables: {
        i: { sourceDataKeys: string[]; numberOfDataPoints: number };
      };
    }>();
    assert.deepEqual(body.variables.i.sourceDataKeys, [KEY]);
    assert.isAbove(body.variables.i.numberOfDataPoints, 288);
  } finally {
    server.restore();
  }
});

test("uv - pretty prints and caches", async () => {
  const server = mockFetch(SERIES);
  try {
    const res = await uv(new Request("http://localhost/x/uv?pretty=true"));
    assert.include(await res.text(), "\n");
    await uv(new Request("http://localhost/x/uv"));
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("uv - throws when island.is responds with an error", async () => {
  const server = mockFetch({}, 503);
  try {
    await uv(new Request("http://localhost/x/uv")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});

test("uv - throws when the GraphQL response changes shape", async () => {
  const server = mockFetch({
    errors: [{ message: "Cannot query field" }],
    data: null,
  });
  try {
    await uv(new Request("http://localhost/x/uv")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "Unexpected"),
    );
  } finally {
    server.restore();
  }
});

test("uv - throws when there are no measurements", async () => {
  const server = mockFetch({
    data: { getStatisticsByKeys: { statistics: [] } },
  });
  try {
    await uv(new Request("http://localhost/x/uv")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "No UV index"),
    );
  } finally {
    server.restore();
  }
});
