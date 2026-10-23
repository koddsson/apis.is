import { assert, test } from "vitest";
import worker from "./index.ts";

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
        "/x/earthquakes",
        "/x/weather/{station}",
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

  try {
    const pending: Promise<unknown>[] = [];
    worker.scheduled({} as ScheduledController, {}, {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as unknown as ExecutionContext);
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
        "/x/earthquakes",
        "/x/weather/{station}",
      ],
    );
    assert.isUndefined(
      results.find((r) => r.endpoint === "/x/meetups")?.problem,
    );
    assert.isDefined(
      results.find((r) => r.endpoint === "/x/gengi/{code}")?.problem,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
  }
});
