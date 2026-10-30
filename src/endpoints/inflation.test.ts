import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import { feed, serveGroups } from "../sedlabanki.test-helper.ts";
import inflation from "./inflation.ts";

beforeEach(() => {
  clearCache();
});

const MONTHS = Array.from({ length: 14 }, (_, i) => {
  const date = new Date(Date.UTC(2025, 8 + i, 1));
  return date.toISOString().slice(0, 10);
});

const CPI = feed({
  "1": MONTHS.map((date, i): [string, number] => [date, 660 + i * 3]),
  "2": MONTHS.slice(1).map((date, i): [string, number] => [date, 5 + i / 10]),
});

type Month = { month: string; index: number; inflation: number | null };
type Inflation = {
  latest: Month;
  months: Month[];
  source: string;
  note: string;
};

test("inflation - returns the last 12 months by default", async () => {
  const server = serveGroups({ 3: CPI });
  try {
    const res = await inflation(new Request("http://localhost/x/inflation"));
    assert.isUndefined(
      validate(inflation.health.schema, await res.clone().json()),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=43200");

    const data = await res.json<Inflation>();
    assert.deepEqual(data.latest, {
      month: "2026-10",
      index: 699,
      inflation: 6.2,
    });
    assert.lengthOf(data.months, 12);
    assert.equal(data.months[0].month, "2025-11");
    assert.deepEqual(data.months.at(-1), data.latest);
    assert.equal(server.urls[0].searchParams.get("GroupID"), "3");
  } finally {
    server.restore();
  }
});

test("inflation - honours ?months= and leaves gaps as null", async () => {
  const server = serveGroups({ 3: CPI });
  try {
    const res = await inflation(
      new Request("http://localhost/x/inflation?months=120&pretty=true"),
    );
    const text = await res.text();
    assert.include(text, '\n  "latest"');
    const data = JSON.parse(text) as Inflation;
    assert.lengthOf(data.months, 14);
    assert.deepEqual(data.months[0], {
      month: "2025-09",
      index: 660,
      inflation: null,
    });
  } finally {
    server.restore();
  }
});

test("inflation - rejects an invalid ?months=", async () => {
  for (const months of ["0", "121", "abc", "1.5"]) {
    const res = await inflation(
      new Request(`http://localhost/x/inflation?months=${months}`),
    );
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: "months must be a whole number from 1 to 120",
    });
  }
});
