// Live integration tests that make real API calls to external services
// These tests verify that external APIs are still available and returning data in expected format
// Run these with: npm run test:live
// These can be run periodically (e.g., daily) as a watchdog for breaking changes in external APIs

import { assert, test } from "vitest";
import car from "./car.ts";
import earthquakes from "./earthquakes.ts";
import gengi from "./gengi.ts";
import raceCalendar from "./race-calendar.ts";
import weather from "./weather.ts";

type Rates = Record<string, { rate: number; description?: string }>;

test("LIVE - gengi endpoint fetches real currency data", async () => {
  const req = new Request("http://localhost/x/gengi");
  const res = await gengi(req, {});

  assert.deepEqual(
    res.status,
    200,
    `Expected status 200 but got ${res.status}`,
  );

  const data = await res.json<Rates>();
  assert.deepEqual(
    typeof data,
    "object",
    `Expected data to be an object but got ${typeof data}. Data: ${JSON.stringify(
      data,
    )}`,
  );

  // Check that common currencies are present
  assert.deepEqual(
    typeof data.USD,
    "object",
    `Expected USD to be an object but got ${typeof data.USD}. Available currencies: ${Object.keys(data).join(", ")}`,
  );
  assert.deepEqual(
    typeof data.USD?.rate,
    "number",
    `Expected USD.rate to be a number but got ${typeof data.USD
      ?.rate}. USD object: ${JSON.stringify(data.USD)}`,
  );
  assert.deepEqual(
    data.USD.rate > 0,
    true,
    `Expected USD.rate to be positive but got ${data.USD.rate}`,
  );

  assert.deepEqual(
    typeof data.EUR,
    "object",
    `Expected EUR to be an object but got ${typeof data.EUR}. Available currencies: ${Object.keys(data).join(", ")}`,
  );
  assert.deepEqual(
    typeof data.EUR?.rate,
    "number",
    `Expected EUR.rate to be a number but got ${typeof data.EUR
      ?.rate}. EUR object: ${JSON.stringify(data.EUR)}`,
  );
  assert.deepEqual(
    data.EUR.rate > 0,
    true,
    `Expected EUR.rate to be positive but got ${data.EUR.rate}`,
  );
});

test("LIVE - gengi endpoint filters by currency code", async () => {
  const req = new Request("http://localhost/x/gengi/USD");
  const res = await gengi(req, { code: "USD" });

  assert.deepEqual(
    res.status,
    200,
    `Expected status 200 but got ${res.status}`,
  );

  const data = await res.json<Rates>();
  assert.deepEqual(
    typeof data.USD,
    "object",
    `Expected USD to be an object but got ${typeof data.USD}. Returned data: ${JSON.stringify(data)}`,
  );
  assert.deepEqual(
    typeof data.EUR,
    "undefined",
    `Expected EUR to be undefined but got ${typeof data.EUR}. Returned currencies: ${Object.keys(data).join(", ")}`,
  );
});

test("LIVE - car endpoint fetches real vehicle data (if available)", async () => {
  // Note: This test might fail if the test registration number doesn't exist
  // or if the island.is API changes
  const req = new Request("http://localhost/x/car/ISE92");
  const res = await car(req, { number: "ISE92" });

  assert.deepEqual(
    res.status,
    200,
    `Expected status 200 but got ${res.status}`,
  );

  const data = await res.json<Record<string, unknown>>();
  // The API returns an object
  assert.deepEqual(
    typeof data,
    "object",
    `Expected data to be an object but got ${typeof data}. Data type: ${Object.prototype.toString.call(
      data,
    )}. Data: ${JSON.stringify(data, null, 2)}`,
  );
  assert.deepEqual(
    data !== null,
    true,
    `Expected data to be a non-null object but got null`,
  );
});

test("LIVE - raceCalendar endpoint fetches real race data", async () => {
  const req = new Request("http://localhost/x/race-calendar");
  const res = await raceCalendar(req);

  assert.deepEqual(
    res.status,
    200,
    `Expected status 200 but got ${res.status}`,
  );

  const data = await res.json<Record<string, unknown>[]>();
  // The API should return an array
  assert.deepEqual(
    Array.isArray(data),
    true,
    `Expected data to be an array but got ${typeof data}. Data type: ${Object.prototype.toString.call(
      data,
    )}. Data: ${JSON.stringify(data, null, 2)}`,
  );

  // If there are races, validate the structure
  if (data.length > 0) {
    const firstRace = data[0];
    assert.deepEqual(
      typeof firstRace,
      "object",
      `Expected first race to be an object but got ${typeof firstRace}. First race: ${JSON.stringify(
        firstRace,
      )}`,
    );
    // The race object should have some properties
    assert.deepEqual(
      Object.keys(firstRace).length > 0,
      true,
      `Expected first race to have properties but got empty object. First race: ${JSON.stringify(
        firstRace,
      )}`,
    );
  }
});

test("LIVE - earthquakes endpoint parses vedur.is", async () => {
  const res = await earthquakes(new Request("http://localhost/x/earthquakes"));
  assert.equal(res.status, 200);

  const data = await res.json<Array<Record<string, unknown>>>();
  assert.isArray(data);
  for (const quake of data) {
    assert.isString(quake.time);
    assert.isNumber(quake.latitude);
    assert.isNumber(quake.magnitude);
    assert.isFalse(Number.isNaN(quake.magnitude));
  }
});

test("LIVE - weather endpoint lists stations and reads Reykjavík", async () => {
  const list = await weather(new Request("http://localhost/x/weather"), {});
  assert.equal(list.status, 200);
  const stations = await list.json<Array<{ id: number; name: string }>>();
  assert.isTrue(stations.some((station) => station.id === 1));

  const res = await weather(
    new Request("http://localhost/x/weather/1?forecast=true"),
    { station: "1" },
  );
  assert.equal(res.status, 200);
  const data = await res.json<{
    name: string;
    time: string;
    forecast: Array<{ time: string }>;
  }>();
  assert.equal(data.name, "Reykjavík");
  assert.match(data.time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.isAbove(data.forecast.length, 0);
});
