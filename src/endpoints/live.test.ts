// Live integration tests that make real API calls to external services
// These tests verify that external APIs are still available and returning data in expected format
// Run these with: deno test --allow-net src/endpoints/live.test.ts
// These can be run periodically (e.g., daily) as a watchdog for breaking changes in external APIs

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import gengi from "./gengi.ts";
import car from "./car.ts";
import raceCalendar from "./race-calendar.ts";

Deno.test({
  name: "LIVE - gengi endpoint fetches real currency data",
  ignore: Deno.env.get("SKIP_LIVE_TESTS") === "true",
  async fn() {
    const req = new Request("http://localhost/x/gengi");
    const res = await gengi(req, {});

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(typeof data, "object");

    // Check that common currencies are present
    assertEquals(typeof data.USD, "object");
    assertEquals(typeof data.USD.rate, "number");
    assertEquals(data.USD.rate > 0, true);

    assertEquals(typeof data.EUR, "object");
    assertEquals(typeof data.EUR.rate, "number");
    assertEquals(data.EUR.rate > 0, true);
  },
});

Deno.test({
  name: "LIVE - gengi endpoint filters by currency code",
  ignore: Deno.env.get("SKIP_LIVE_TESTS") === "true",
  async fn() {
    const req = new Request("http://localhost/x/gengi/USD");
    const res = await gengi(req, { code: "USD" });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(typeof data.USD, "object");
    assertEquals(typeof data.EUR, "undefined");
  },
});

Deno.test({
  name: "LIVE - car endpoint fetches real vehicle data (if available)",
  ignore: Deno.env.get("SKIP_LIVE_TESTS") === "true",
  async fn() {
    // Note: This test might fail if the test registration number doesn't exist
    // or if the island.is API changes
    const req = new Request("http://localhost/x/car/ISE92");
    const res = await car(req, { number: "ISE92" });

    assertEquals(res.status, 200);

    const data = await res.json();
    // The API should return an array, even if empty
    assertEquals(Array.isArray(data), true);
  },
});

Deno.test({
  name: "LIVE - raceCalendar endpoint fetches real race data",
  ignore: Deno.env.get("SKIP_LIVE_TESTS") === "true",
  async fn() {
    const req = new Request("http://localhost/x/race-calendar");
    const res = await raceCalendar(req);

    assertEquals(res.status, 200);

    const data = await res.json();
    // The API should return an array
    assertEquals(Array.isArray(data), true);

    // If there are races, validate the structure
    if (data.length > 0) {
      const firstRace = data[0];
      assertEquals(typeof firstRace, "object");
      // The race object should have some properties
      assertEquals(Object.keys(firstRace).length > 0, true);
    }
  },
});
