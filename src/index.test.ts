import { assert, test, vi } from "vitest";
import worker, { onUnhandledRejection } from "./index.ts";

test("index - lists every registered endpoint", async () => {
  const originalLog = console.log;
  console.log = () => {};

  try {
    const res = await worker.fetch(new Request("http://localhost/"));
    const data = await res.json<{
      endpoints: Array<{ endpoint: string }>;
    }>();

    assert.deepEqual(
      data.endpoints.map((e) => e.endpoint),
      [
        "/x/gengi/{code}",
        "/x/meetups",
        "/x/car/{number}",
        "/x/race-calendar",
        "/x/nova-2f1",
        "/x/weather/{station}",
        "/x/bus/stops/{id}",
        "/x/bus/routes",
        "/x/bus/vehicles",
        "/x/flights/{type}",
        "/x/roads/conditions",
        "/x/roads/weather",
        "/x/traffic",
        "/x/waves",
        "/x/outages",
        "/x/pools",
        "/x/avalanche",
        "/x/air-quality",
        "/x/population",
        "/x/population/births",
        "/x/tv",
        "/x/recalls",
        "/x/uv",
        "/x/reservoirs",
        "/x/lightning",
        "/x/althingi/votes",
        "/x/aurora",
      ],
    );
  } finally {
    console.log = originalLog;
  }
});

test("index - returns 404 for unknown paths", async () => {
  const originalLog = console.log;
  console.log = () => {};

  try {
    const res = await worker.fetch(new Request("http://localhost/nope"));
    assert.deepEqual(res.status, 404);
  } finally {
    console.log = originalLog;
  }
});

test("index - reports unhandled rejections", () => {
  const originalError = console.error;
  const reported: string[] = [];
  console.error = (label: string, report: { message: string }) => {
    if (label === "Uncaught error:") reported.push(report.message);
  };

  try {
    for (const reason of [new TypeError("boom"), "not an error"]) {
      let prevented = false;
      onUnhandledRejection({
        reason,
        preventDefault: () => {
          prevented = true;
        },
      } as PromiseRejectionEvent);
      assert.isTrue(prevented);
    }
    assert.deepEqual(reported, ["boom", "not an error"]);
  } finally {
    console.error = originalError;
  }
});

test("index - scheduled handler checks endpoint health", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  let logged: unknown;
  globalThis.fetch = () =>
    Promise.resolve(new Response("unavailable", { status: 503 }));
  console.log = (label: string, results: unknown) => {
    if (label === "Endpoint health:") logged = results;
  };
  console.error = () => {};
  vi.useFakeTimers();

  try {
    const pending: Promise<unknown>[] = [];
    worker.scheduled({} as ScheduledController, {}, {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as unknown as ExecutionContext);
    await vi.runAllTimersAsync();
    await Promise.all(pending);

    const results = logged as Array<{ endpoint: string; problem?: string }>;
    assert.deepEqual(
      results.map((r) => r.endpoint),
      [
        "/x/gengi/{code}",
        "/x/meetups",
        "/x/car/{number}",
        "/x/race-calendar",
        "/x/nova-2f1",
        "/x/weather/{station}",
        "/x/bus/stops/{id}",
        "/x/bus/routes",
        "/x/bus/vehicles",
        "/x/flights/{type}",
        "/x/roads/conditions",
        "/x/roads/weather",
        "/x/traffic",
        "/x/waves",
        "/x/outages",
        "/x/pools",
        "/x/avalanche",
        "/x/air-quality",
        "/x/population",
        "/x/population/births",
        "/x/tv",
        "/x/recalls",
        "/x/uv",
        "/x/reservoirs",
        "/x/lightning",
        "/x/althingi/votes",
        "/x/aurora",
      ],
    );
    assert.isUndefined(
      results.find((r) => r.endpoint === "/x/meetups")?.problem,
    );
    assert.isDefined(
      results.find((r) => r.endpoint === "/x/gengi/{code}")?.problem,
    );
  } finally {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
  }
});
