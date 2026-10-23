import { assert, test } from "vitest";
import raceCalendar from "./race-calendar.ts";

const mockRaceCalendarResponse = {
  dataItems: [
    {
      id: "1",
      name: "Reykjavik Marathon",
      date: "2024-08-24",
      location: "Reykjavik",
    },
    {
      id: "2",
      name: "Laugavegur Ultra Marathon",
      date: "2024-07-13",
      location: "Highlands",
    },
  ],
};

test("raceCalendar - fetches and returns race data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockRaceCalendarResponse), {
        status: 200,
      }),
    );
  };

  try {
    const req = new Request("http://localhost/x/race-calendar");
    const res = await raceCalendar(req);

    assert.deepEqual(res.status, 200);
    assert.deepEqual(res.headers.get("Access-Control-Allow-Origin"), "*");

    const data = await res.json<Array<{ name: string }>>();
    assert.deepEqual(Array.isArray(data), true);
    assert.deepEqual(data.length, 2);
    assert.deepEqual(data[0].name, "Reykjavik Marathon");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("raceCalendar - throws when upstream responds with an error", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  globalThis.fetch = () =>
    Promise.resolve(new Response("Service Unavailable", { status: 503 }));
  console.error = () => {};

  try {
    const req = new Request("http://localhost/x/race-calendar");
    let thrown: unknown;
    try {
      await raceCalendar(req);
    } catch (error) {
      thrown = error;
    }

    assert.instanceOf(thrown, Error);
    assert.include(
      (thrown as Error).message,
      "Failed to fetch data: 503 - Service Unavailable",
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("raceCalendar - returns compact JSON by default", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockRaceCalendarResponse), {
        status: 200,
      }),
    );
  };

  try {
    const req = new Request("http://localhost/x/race-calendar");
    const res = await raceCalendar(req);

    const text = await res.text();
    assert.deepEqual(text.includes("\n"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("raceCalendar - returns pretty JSON when pretty=true", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockRaceCalendarResponse), {
        status: 200,
      }),
    );
  };

  try {
    const req = new Request("http://localhost/x/race-calendar?pretty=true");
    const res = await raceCalendar(req);

    const text = await res.text();
    assert.deepEqual(text.includes("\n"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("raceCalendar - has correct meta information", () => {
  assert.deepEqual(raceCalendar.meta?.endpoint, "/x/race-calendar");
  assert.include(raceCalendar.meta?.description || "", "Icelandic runs");
});
