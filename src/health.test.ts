import { assert, test, vi } from "vitest";
import { checkEndpoints, expectNonEmptyArray, reportHealth } from "./health.ts";
import { Router } from "./router.ts";
import { response } from "./utils.ts";

function withMeta<T extends object>(handler: T, endpoint: string) {
  return Object.assign(handler, { meta: { endpoint, description: "" } });
}

test("expectNonEmptyArray - accepts only non-empty arrays", () => {
  assert.isUndefined(expectNonEmptyArray([1]));
  assert.equal(expectNonEmptyArray([]), "Expected at least one item, got none");
  assert.equal(expectNonEmptyArray({}), "Expected an array");
});

test("checkEndpoints - runs each declared check with its params", async () => {
  const router = new Router();
  const seen: string[] = [];

  const ok = withMeta((req: Request, params: Record<string, string>) => {
    seen.push(`${new URL(req.url).pathname} ${JSON.stringify(params)}`);
    return response([1]);
  }, "/x/ok/{code}");
  router.add(
    "GET",
    "/x/ok/{:code}?",
    Object.assign(ok, {
      health: { params: { code: "USD" }, check: expectNonEmptyArray },
    }),
  );

  const optional = withMeta((req: Request) => {
    seen.push(new URL(req.url).pathname);
    return response([]);
  }, "/x/optional/{id}");
  router.add(
    "GET",
    "/x/optional/{:id}?",
    Object.assign(optional, { health: { check: expectNonEmptyArray } }),
  );

  const failing = withMeta(
    () => new Response(null, { status: 503 }),
    "/x/failing",
  );
  router.add(
    "GET",
    "/x/failing",
    Object.assign(failing, { health: { check: expectNonEmptyArray } }),
  );

  const throwing = withMeta(() => {
    throw new TypeError("boom");
  }, "/x/throwing");
  router.add(
    "GET",
    "/x/throwing",
    Object.assign(throwing, { health: { check: expectNonEmptyArray } }),
  );

  const rejecting = withMeta(
    () => Promise.reject("not an error"),
    "/x/rejecting",
  );
  router.add(
    "GET",
    "/x/rejecting",
    Object.assign(rejecting, { health: { check: expectNonEmptyArray } }),
  );

  router.add(
    "GET",
    "/x/unchecked",
    withMeta(() => response([]), "/x/unchecked"),
  );

  const results = await checkEndpoints(router);

  assert.deepEqual(results, [
    { endpoint: "/x/ok/{code}", problem: undefined },
    {
      endpoint: "/x/optional/{id}",
      problem: "Expected at least one item, got none",
    },
    { endpoint: "/x/failing", problem: "HTTP 503" },
    { endpoint: "/x/throwing", problem: "TypeError: boom" },
    { endpoint: "/x/rejecting", problem: "not an error" },
  ]);
  assert.deepEqual(seen, ['/x/ok/USD {"code":"USD"}', "/x/optional"]);
});

test("reportHealth - only logs outside production", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let fetched = false;
  globalThis.fetch = () => {
    fetched = true;
    return Promise.resolve(new Response("[]"));
  };
  console.log = () => {};

  try {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    await reportHealth([{ endpoint: "/x/a", problem: "down" }]);
    assert.isFalse(fetched);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test("reportHealth - opens, leaves, and closes endpoint issues", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string; body?: string }> = [];

  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    calls.push({
      method: init?.method ?? "GET",
      url,
      body: init?.body as string | undefined,
    });
    if (url.includes("/issues?")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { number: 5, body: "**Endpoint:** `/x/recovered`" },
            {
              number: 6,
              body: "```\nHTTP 500\n```\n**Endpoint:** `/x/still-down`",
            },
            {
              number: 7,
              body: "```\nHTTP 502\n```\n**Endpoint:** `/x/changed`",
            },
          ]),
        ),
      );
    }
    return Promise.resolve(new Response("{}", { status: 201 }));
  };

  try {
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    await reportHealth([
      { endpoint: "/x/new-down", problem: "HTTP 500" },
      { endpoint: "/x/recovered" },
      { endpoint: "/x/still-down", problem: "HTTP 500" },
      { endpoint: "/x/changed", problem: "HTTP 403 (cf-ray abc-SIN)" },
      { endpoint: "/x/healthy" },
    ]);

    assert.include(calls[0].url, "/issues?state=open&labels=endpoint-down");
    assert.deepEqual(
      calls.slice(1).map((c) => `${c.method} ${c.url}`),
      [
        "POST https://api.github.com/repos/owner/repo/issues",
        "POST https://api.github.com/repos/owner/repo/issues/5/comments",
        "PATCH https://api.github.com/repos/owner/repo/issues/5",
        "PATCH https://api.github.com/repos/owner/repo/issues/7",
      ],
    );

    const created = JSON.parse(calls[1].body ?? "{}");
    assert.equal(created.title, "🔻 Endpoint down: /x/new-down");
    assert.include(created.body, "HTTP 500");
    assert.include(created.body, "**Endpoint:** `/x/new-down`");
    assert.deepEqual(created.labels, ["endpoint-down", "automated", "bug"]);

    assert.deepEqual(JSON.parse(calls[3].body ?? "{}"), {
      state: "closed",
      state_reason: "completed",
    });

    const updated = JSON.parse(calls[4].body ?? "{}");
    assert.deepEqual(Object.keys(updated), ["body"]);
    assert.include(updated.body, "HTTP 403 (cf-ray abc-SIN)");
    assert.include(updated.body, "**Endpoint:** `/x/changed`");
    assert.match(updated.body, /last seen \d{4}-\d{2}-\d{2}T/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reportHealth - logs GitHub failures instead of throwing", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let logged = "";
  globalThis.fetch = () =>
    Promise.resolve(new Response("nope", { status: 502 }));
  console.error = (msg: string) => {
    logged = msg;
  };

  try {
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    await reportHealth([{ endpoint: "/x/a", problem: "down" }]);

    assert.equal(logged, "Failed to report endpoint health:");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("reportHealth - logs results in production too", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let logged: unknown;
  globalThis.fetch = () => Promise.resolve(new Response("[]"));
  console.log = (label: string, results: unknown) => {
    if (label === "Endpoint health:") logged = results;
  };

  try {
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    const results = [{ endpoint: "/x/a" }];
    await reportHealth(results);

    assert.deepEqual(logged, results);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});
