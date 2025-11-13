import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
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

Deno.test("raceCalendar - fetches and returns race data", async () => {
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

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");

    const data = await res.json();
    assertEquals(Array.isArray(data), true);
    assertEquals(data.length, 2);
    assertEquals(data[0].name, "Reykjavik Marathon");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("raceCalendar - returns compact JSON by default", async () => {
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
    assertEquals(text.includes("\n"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("raceCalendar - returns pretty JSON when pretty=true", async () => {
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
    assertEquals(text.includes("\n"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("raceCalendar - has correct meta information", () => {
  assertEquals(raceCalendar.meta?.endpoint, "/x/race-calendar");
  assertStringIncludes(
    raceCalendar.meta?.description || "",
    "Icelandic runs",
  );
});
