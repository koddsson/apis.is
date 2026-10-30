import { assert, test, vi } from "vitest";
import { feed, NO_DATA, serveGroups } from "./sedlabanki.test-helper.ts";
import { fetchGroup, isoDate, series } from "./sedlabanki.ts";

test("isoDate - converts the feed's US dates", () => {
  assert.equal(isoDate("10/1/2026 12:00:00 AM"), "2026-10-01");
  assert.equal(isoDate("12/31/2025 12:00:00 AM"), "2025-12-31");
});

test("fetchGroup - requests the group over the given number of days", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-30T12:00:00Z") });
  const server = serveGroups({
    3: feed({ "1": [["2026-10-01", 700.4]], "2": [] }),
  });
  try {
    const groups = await fetchGroup(3, 30);
    const params = Object.fromEntries(server.urls[0].searchParams);
    assert.deepEqual(params, {
      GroupID: "3",
      DagsFra: "2026-09-30",
      DagsTil: "2026-10-30",
      Type: "xml",
    });
    assert.deepEqual(groups.get("1"), [{ date: "2026-10-01", value: 700.4 }]);
    assert.deepEqual(groups.get("2"), []);
  } finally {
    vi.useRealTimers();
    server.restore();
  }
});

test("fetchGroup - throws on an HTTP error", async () => {
  const server = serveGroups({ 1: 503 });
  try {
    await fetchGroup(1, 1).then(
      () => assert.fail("expected an error"),
      (error: Error) =>
        assert.equal(error.message, "Failed to fetch from Seðlabanki: 503"),
    );
  } finally {
    server.restore();
  }
});

test("fetchGroup - throws when the feed has no data", async () => {
  const server = serveGroups({ 1: NO_DATA });
  try {
    await fetchGroup(1, 1).then(
      () => assert.fail("expected an error"),
      (error: Error) =>
        assert.equal(error.message, "No data from Seðlabanki group 1"),
    );
  } finally {
    server.restore();
  }
});

test("series - throws for a missing or empty series", () => {
  const groups = new Map([["2", []]]);
  assert.throws(() => series(groups, "1"), "No data for Seðlabanki series 1");
  assert.throws(() => series(groups, "2"), "No data for Seðlabanki series 2");
});
