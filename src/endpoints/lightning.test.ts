import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import lightning from "./lightning.ts";

beforeEach(() => {
  clearCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2023-08-07T22:31:31Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const HEADER = `------------------------------------------------------------
Eldingar við Ísland (63-67°N, 13-25°V) @ 2023-08-07_22:31:31
                                  Breidd  Lengd óvissa Gæði
Dagsetning_Tími             Númer   °N     °V      km  G=góð
------------------------------------------------------------
`;

const STRIKES = `${HEADER}2023-08-07_19:53:34.1444778 13549 64.665   18.61   6.28 G
2023-08-07_19:53:34.1806679 13550 64.660  18.609   6.27 G
2023-08-05_17:56:12 11912 64.808  21.974   4.36 B
2023-08-07_18:06:14.4116411  1672 64.407  18.908  14.36 G
`;

const EMPTY = `${HEADER}Engar eldingar hafa mælst við Ísland sl. viku
`;

function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function mockFetch(body: string, status = 200) {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return Promise.resolve(new Response(latin1(body), { status }));
  };
  return { requests, restore: () => (globalThis.fetch = originalFetch) };
}

test("lightning - parses strikes newest first with western longitudes", async () => {
  const server = mockFetch(STRIKES);
  try {
    const res = await lightning(new Request("http://localhost/x/lightning"));
    const data = await res.json();
    assert.isUndefined(validate(lightning.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=60");
    assert.equal(
      server.requests[0].url,
      "https://brunnur.vedur.is/athuganir/elding/elding.txt",
    );
    assert.equal(
      server.requests[0].headers.get("User-Agent"),
      "apis.is (+https://apis.is)",
    );
    assert.deepEqual(data, [
      {
        time: "2023-08-07T19:53:34.180Z",
        latitude: 64.66,
        longitude: -18.609,
        uncertainty: 6.27,
        goodQuality: true,
      },
      {
        time: "2023-08-07T19:53:34.144Z",
        latitude: 64.665,
        longitude: -18.61,
        uncertainty: 6.28,
        goodQuality: true,
      },
      {
        time: "2023-08-07T18:06:14.411Z",
        latitude: 64.407,
        longitude: -18.908,
        uncertainty: 14.36,
        goodQuality: true,
      },
      {
        time: "2023-08-05T17:56:12.000Z",
        latitude: 64.808,
        longitude: -21.974,
        uncertainty: 4.36,
        goodQuality: false,
      },
    ]);
  } finally {
    server.restore();
  }
});

test("lightning - filters by hours and validates them", async () => {
  const server = mockFetch(STRIKES);
  try {
    const recent = await lightning(
      new Request("http://localhost/x/lightning?hours=3&pretty=true"),
    );
    const text = await recent.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((strike: { time: string }) => strike.time),
      ["2023-08-07T19:53:34.180Z", "2023-08-07T19:53:34.144Z"],
    );

    for (const hours of ["0", "-1", "169", "soon", ""]) {
      const res = await lightning(
        new Request(`http://localhost/x/lightning?hours=${hours}`),
      );
      assert.equal(res.status, 400);
    }
    assert.equal(server.requests.length, 1);
  } finally {
    server.restore();
  }
});

test("lightning - returns an empty list when there were no strikes", async () => {
  const server = mockFetch(EMPTY);
  try {
    const res = await lightning(new Request("http://localhost/x/lightning"));
    const data = await res.json();
    assert.deepEqual(data, []);
    assert.isUndefined(validate(lightning.health.schema, data));
  } finally {
    server.restore();
  }
});

test("lightning - throws when Veðurstofan responds with an error", async () => {
  const server = mockFetch("", 503);
  try {
    await lightning(new Request("http://localhost/x/lightning")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});

test("lightning - throws when the file format changes", async () => {
  for (const body of [
    "<html>Not found</html>",
    HEADER.replace(/-+\n$/, ""),
    `${HEADER}2023-08-07 19:53 somewhere\n`,
  ]) {
    clearCache();
    const server = mockFetch(body);
    try {
      await lightning(new Request("http://localhost/x/lightning")).then(
        () => assert.fail("expected an error"),
        (error: Error) => assert.match(error.message, /Unexpected lightning/),
      );
    } finally {
      server.restore();
    }
  }
});
