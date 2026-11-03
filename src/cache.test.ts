import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { cacheControl, clearCache, noStore, withCache } from "./cache.ts";

beforeEach(() => {
  clearCache();
});

afterEach(() => {
  vi.useRealTimers();
});

test("withCache - returns the cached value until the TTL passes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  let calls = 0;
  const fetcher = () => Promise.resolve(++calls);

  assert.equal(await withCache("key", 60, fetcher), 1);
  vi.setSystemTime(new Date("2026-10-23T12:00:59Z"));
  assert.equal(await withCache("key", 60, fetcher), 1);
  vi.setSystemTime(new Date("2026-10-23T12:01:00Z"));
  assert.equal(await withCache("key", 60, fetcher), 2);
});

test("withCache - keeps keys separate", async () => {
  assert.equal(await withCache("a", 60, () => Promise.resolve("a")), "a");
  assert.equal(await withCache("b", 60, () => Promise.resolve("b")), "b");
});

test("withCache - shares one fetch between concurrent callers", async () => {
  let calls = 0;
  const fetcher = () => Promise.resolve(++calls);

  const results = await Promise.all([
    withCache("key", 60, fetcher),
    withCache("key", 60, fetcher),
  ]);

  assert.deepEqual(results, [1, 1]);
  assert.equal(calls, 1);
});

test("withCache - does not cache failures", async () => {
  let calls = 0;
  const failing = () => {
    calls++;
    return Promise.reject(new Error("upstream down"));
  };

  let thrown: unknown;
  try {
    await withCache("key", 60, failing);
  } catch (error) {
    thrown = error;
  }
  assert.instanceOf(thrown, Error);

  assert.equal(await withCache("key", 60, () => Promise.resolve("ok")), "ok");
  assert.equal(calls, 1);
});

test("withCache - a failure does not evict a newer entry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  let rejectFirst: (error: Error) => void = () => {};
  const first = withCache(
    "key",
    1,
    () =>
      new Promise<string>((_, reject) => {
        rejectFirst = reject;
      }),
  );

  vi.setSystemTime(new Date("2026-10-23T12:00:02Z"));
  assert.equal(await withCache("key", 60, () => Promise.resolve("new")), "new");

  rejectFirst(new Error("late failure"));
  try {
    await first;
  } catch {}

  assert.equal(
    await withCache("key", 60, () => Promise.resolve("refetched")),
    "new",
  );
});

test("cacheControl - caches at the edge for the TTL and in browsers for a minute", () => {
  assert.equal(cacheControl(900), "public, s-maxage=900, max-age=60");
});

test("cacheControl - keeps the browser max-age within a short TTL", () => {
  assert.equal(cacheControl(30), "public, s-maxage=30, max-age=30");
});

test("cacheControl - takes an explicit browser max-age", () => {
  assert.equal(cacheControl(3600, 300), "public, s-maxage=3600, max-age=300");
});

test("noStore - marks a response without Cache-Control as uncacheable", () => {
  const res = noStore(new Response("ok"));
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("noStore - keeps a Cache-Control the handler set", () => {
  const res = noStore(
    new Response("ok", { headers: { "Cache-Control": cacheControl(900) } }),
  );
  assert.equal(res.headers.get("Cache-Control"), cacheControl(900));
});
