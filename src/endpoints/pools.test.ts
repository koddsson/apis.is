import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import pools, { parsePools } from "./pools.ts";

beforeEach(() => {
  clearCache();
});

afterEach(() => {
  vi.useRealTimers();
});

const NOW_PLOT = {
  data: [
    {
      type: "bar",
      x: [2, 1],
      y: [0.5, 0.45],
      text: [
        "Sundlaug: Vesturbæjarlaug<br />value: 0.5<br />name: hlutfall",
        "Sundlaug: Árbæjarlaug<br />value: 0.45<br />name: hlutfall",
      ],
    },
    {
      type: "scatter",
      x: [2, 1],
      y: [0.54, 0.49],
      text: [91, 54],
      hovertext: [
        "Sundlaug: Vesturbæjarlaug<br />name: hlutfall<br />Fjöldi sundgesta: 91",
        "Sundlaug: Árbæjarlaug<br />name: hlutfall<br />Fjöldi sundgesta: 54",
      ],
    },
    {
      type: "scatter",
      x: [2, 1],
      y: [1.04, 1.04],
      text: [230, 240],
      hovertext: [
        "Sundlaug: Vesturbæjarlaug<br />1 + 0.04: 1.04<br />name: rest<br />cap: 230",
        "Sundlaug: Árbæjarlaug<br />1 + 0.04: 1.04<br />name: rest<br />cap: 240",
      ],
    },
  ],
};

const TODAY_PLOT = {
  data: [
    {
      name: "Árbæjarlaug",
      x: [1792996200, 1792996500],
      y: [8, 15],
      text: ["Klukkan: 2026-10-26 06:30:00<br />Fjöldi sundgesta: 8"],
    },
    { x: [0], y: [0] },
  ],
};

function frame(id: string, message: unknown) {
  return `a${JSON.stringify([`${id}#0|m|${JSON.stringify(message)}`])}`;
}

function plotFrame(id: string, plot: unknown) {
  return frame(id, { errors: {}, values: { plotly: { x: plot } } });
}

type Reply = (server: WebSocket, method: string) => void;

const dashboard: Reply = (server, method) => {
  server.send("h");
  server.send('a["0#0|m|{\\"busy\\":\\"busy\\"}","ACK 2"]');
  server.send(
    method === "init" ? plotFrame("6", NOW_PLOT) : plotFrame("C", TODAY_PLOT),
  );
};

function mockFetch({
  page = new Response('<base href="_w_d54bd275/">', {
    headers: [
      ["Set-Cookie", "rscid=abc; Path=/; HttpOnly"],
      ["Set-Cookie", "rsc-job=def; Path=/"],
    ],
  }),
  token = new Response("93e425d0"),
  reply = dashboard,
  upgrade = true,
}: {
  page?: Response;
  token?: Response;
  reply?: Reply;
  upgrade?: boolean;
} = {}) {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; headers: Headers }> = [];
  const sent: unknown[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    requests.push({ url, headers: new Headers(init?.headers) });
    if (url.endsWith("/__token__")) return Promise.resolve(token);
    if (!url.endsWith("/websocket")) return Promise.resolve(page);
    if (!upgrade) return Promise.resolve(new Response("", { status: 404 }));

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    server.addEventListener("message", ({ data }) => {
      for (const message of JSON.parse(String(data)) as string[]) {
        sent.push(message);
        const body = /\|m\|(.*)$/.exec(message);
        if (body) reply(server, JSON.parse(body[1]).method);
      }
    });
    server.send("o");
    return Promise.resolve(
      new Response(null, { status: 101, webSocket: client }),
    );
  };
  return {
    requests,
    sent,
    restore: () => (globalThis.fetch = originalFetch),
  };
}

function get(query = "") {
  return pools(new Request(`http://localhost/x/pools${query}`));
}

test("pools - reads capacity and today's counts from the dashboard", async () => {
  const server = mockFetch();
  try {
    const res = await get();
    const data = await res.json();
    assert.isUndefined(validate(pools.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
    assert.deepEqual(data, [
      {
        name: "Árbæjarlaug",
        capacity: 240,
        count: 15,
        time: "2026-10-26T06:35:00.000Z",
        today: [
          { time: "2026-10-26T06:30:00.000Z", count: 8 },
          { time: "2026-10-26T06:35:00.000Z", count: 15 },
        ],
      },
      {
        name: "Vesturbæjarlaug",
        capacity: 230,
        count: null,
        time: null,
        today: [],
      },
    ]);

    const [, token, socket] = server.requests;
    assert.equal(token.headers.get("cookie"), "rscid=abc; rsc-job=def");
    assert.include(socket.url, "/t=93e425d0/w=d54bd275/");
    assert.equal(socket.headers.get("Upgrade"), "websocket");
    assert.deepEqual(server.sent[0], "0#0|o|");
    assert.include(String(server.sent[1]), '"radio":"Núna"');
    assert.include(String(server.sent[2]), '"radio":"Í dag"');
  } finally {
    server.restore();
  }
});

test("pools - filters by pool name and 404s unknown ones", async () => {
  const server = mockFetch();
  try {
    const one = await get("?pool=vesturbæjarlaug&pretty=true");
    const text = await one.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((pool: { name: string }) => pool.name),
      ["Vesturbæjarlaug"],
    );

    const unknown = await get("?pool=Nauthólsvík");
    assert.equal(unknown.status, 404);
    assert.equal(server.requests.length, 3);
  } finally {
    server.restore();
  }
});

test("pools - throws when the dashboard fails or changes", async () => {
  const cases: Array<[Parameters<typeof mockFetch>[0], string]> = [
    [{ page: new Response("", { status: 503 }) }, "pool dashboard: 503"],
    [{ page: new Response("<html></html>") }, "worker not found"],
    [{ token: new Response("", { status: 403 }) }, "pool token: 403"],
    [{ upgrade: false }, "pool dashboard socket: 404"],
    [
      {
        reply: (server) =>
          server.send(frame("6", { errors: { plotly: "object not found" } })),
      },
      "object not found",
    ],
    [{ reply: (server) => server.close(1011) }, "closed the connection"],
  ];
  for (const [options, message] of cases) {
    clearCache();
    const server = mockFetch(options);
    try {
      await get().then(
        () => assert.fail("expected an error"),
        (error: Error) => assert.include(error.message, message),
      );
    } finally {
      server.restore();
    }
  }
});

test("pools - times out when the dashboard stops answering", async () => {
  vi.useFakeTimers();
  const server = mockFetch({ reply: () => {} });
  try {
    const res = get().then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "Timed out"),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await res;
  } finally {
    server.restore();
  }
});

test("parsePools - rejects a dashboard without capacities", () => {
  assert.throws(
    () => parsePools({ data: [] }, TODAY_PLOT),
    "Pool capacities not found",
  );
});
