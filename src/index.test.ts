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
