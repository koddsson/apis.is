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

    assertEquals(
      res.status,
      200,
      `Expected status 200 but got ${res.status}`,
    );

    const data = await res.json();
    assertEquals(
      typeof data,
      "object",
      `Expected data to be an object but got ${typeof data}. Data: ${
        JSON.stringify(data)
      }`,
    );

    // Check that common currencies are present
    assertEquals(
      typeof data.USD,
      "object",
      `Expected USD to be an object but got ${typeof data
        .USD}. Available currencies: ${Object.keys(data).join(", ")}`,
    );
    assertEquals(
      typeof data.USD?.rate,
      "number",
      `Expected USD.rate to be a number but got ${typeof data.USD
        ?.rate}. USD object: ${JSON.stringify(data.USD)}`,
    );
    assertEquals(
      data.USD.rate > 0,
      true,
      `Expected USD.rate to be positive but got ${data.USD.rate}`,
    );

    assertEquals(
      typeof data.EUR,
      "object",
      `Expected EUR to be an object but got ${typeof data
        .EUR}. Available currencies: ${Object.keys(data).join(", ")}`,
    );
    assertEquals(
      typeof data.EUR?.rate,
      "number",
      `Expected EUR.rate to be a number but got ${typeof data.EUR
        ?.rate}. EUR object: ${JSON.stringify(data.EUR)}`,
    );
    assertEquals(
      data.EUR.rate > 0,
      true,
      `Expected EUR.rate to be positive but got ${data.EUR.rate}`,
    );
  },
});

Deno.test({
  name: "LIVE - gengi endpoint filters by currency code",
  ignore: Deno.env.get("SKIP_LIVE_TESTS") === "true",
  async fn() {
    const req = new Request("http://localhost/x/gengi/USD");
    const res = await gengi(req, { code: "USD" });

    assertEquals(
      res.status,
      200,
      `Expected status 200 but got ${res.status}`,
    );

    const data = await res.json();
    assertEquals(
      typeof data.USD,
      "object",
      `Expected USD to be an object but got ${typeof data
        .USD}. Returned data: ${JSON.stringify(data)}`,
    );
    assertEquals(
      typeof data.EUR,
      "undefined",
      `Expected EUR to be undefined but got ${typeof data
        .EUR}. Returned currencies: ${Object.keys(data).join(", ")}`,
    );
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

    assertEquals(
      res.status,
      200,
      `Expected status 200 but got ${res.status}`,
    );

    const data = await res.json();
    // The API returns an object
    assertEquals(
      typeof data,
      "object",
      `Expected data to be an object but got ${typeof data}. Data type: ${
        Object.prototype.toString.call(data)
      }. Data: ${JSON.stringify(data, null, 2)}`,
    );
    assertEquals(
      data !== null,
      true,
      `Expected data to be a non-null object but got null`,
    );
  },
});

Deno.test({
  name: "LIVE - raceCalendar endpoint fetches real race data",
  ignore: Deno.env.get("SKIP_LIVE_TESTS") === "true",
  async fn() {
    const req = new Request("http://localhost/x/race-calendar");
    const res = await raceCalendar(req);

    assertEquals(
      res.status,
      200,
      `Expected status 200 but got ${res.status}`,
    );

    const data = await res.json();
    // The API should return an array
    assertEquals(
      Array.isArray(data),
      true,
      `Expected data to be an array but got ${typeof data}. Data type: ${
        Object.prototype.toString.call(data)
      }. Data: ${JSON.stringify(data, null, 2)}`,
    );

    // If there are races, validate the structure
    if (data.length > 0) {
      const firstRace = data[0];
      assertEquals(
        typeof firstRace,
        "object",
        `Expected first race to be an object but got ${typeof firstRace}. First race: ${
          JSON.stringify(firstRace)
        }`,
      );
      // The race object should have some properties
      assertEquals(
        Object.keys(firstRace).length > 0,
        true,
        `Expected first race to have properties but got empty object. First race: ${
          JSON.stringify(firstRace)
        }`,
      );
    }
  },
});
