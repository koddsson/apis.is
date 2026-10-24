import { assert, test } from "vitest";
import { validate } from "../health.ts";
import meetups, { type Meetup, upcoming } from "./meetups.ts";

test("meetups - returns meetup data", async () => {
  const req = new Request("http://localhost/x/meetups");
  const res = meetups(req);
  assert.isUndefined(validate(meetups.health.schema, await res.clone().json()));

  assert.deepEqual(res.status, 200);
  assert.deepEqual(res.headers.get("Access-Control-Allow-Origin"), "*");

  const data = await res.json();
  assert.deepEqual(Array.isArray(data), true);
});

test("meetups - returns compact JSON by default", async () => {
  const req = new Request("http://localhost/x/meetups");
  const res = meetups(req);

  const text = await res.text();
  assert.deepEqual(text.includes("\n"), false);
});

test("meetups - returns pretty JSON when pretty=true", async () => {
  const req = new Request("http://localhost/x/meetups?pretty=true");
  const res = meetups(req);

  const text = await res.text();
  assert.deepEqual(text.includes("\n"), true);
});

test("meetups - returns RSS feed when format=rss", async () => {
  const req = new Request("http://localhost/x/meetups?format=rss");
  const res = meetups(req);

  assert.deepEqual(res.status, 200);
  assert.deepEqual(
    res.headers.get("Content-Type"),
    "application/rss+xml; charset=utf-8",
  );
  assert.deepEqual(res.headers.get("Access-Control-Allow-Origin"), "*");

  const text = await res.text();
  assert.include(text, '<?xml version="1.0" encoding="UTF-8"?>');
  assert.include(text, '<rss version="2.0"');
  assert.include(text, "<title>Icelandic Tech Meetups</title>");
  assert.include(text, "<channel>");
});

test("meetups - RSS feed contains meetup items", async () => {
  const req = new Request("http://localhost/x/meetups?format=rss");
  const res = meetups(req);

  const text = await res.text();
  assert.include(text, "<item>");
  assert.include(text, "</item>");
  assert.include(text, "<link>");
  assert.include(text, "<description>");
});

test("meetups - returns JSON by default without format parameter", async () => {
  const req = new Request("http://localhost/x/meetups");
  const res = meetups(req);

  const contentType = res.headers.get("Content-Type");
  // Should not return RSS content type
  assert.deepEqual(contentType === "application/rss+xml; charset=utf-8", false);

  const data = await res.json();
  assert.deepEqual(Array.isArray(data), true);
});

test("meetups - has correct meta information", () => {
  assert.deepEqual(meetups.meta?.endpoint, "/x/meetups");
  assert.include(
    meetups.meta?.description || "",
    "List of Icelandic tech meetups and community groups",
  );
  assert.include(meetups.meta?.description || "", "RSS");
});

function meetup(start: string, end: string | null): Meetup {
  return {
    title: start,
    description: null,
    url: "https://example.com",
    data: { start, end },
  };
}

test("upcoming - keeps meetups that haven't ended", () => {
  const now = Date.parse("2026-11-01T18:00:00Z");
  const list = [
    meetup("2026-10-31T20:00:00Z", null),
    meetup("2026-11-01T17:00:00Z", "2026-11-01T19:00:00Z"),
    meetup("2026-11-01T17:00:00Z", "2026-11-01T17:30:00Z"),
    meetup("2026-11-02T20:00:00Z", null),
  ];
  assert.deepEqual(
    upcoming(list, now).map((m) => m.title),
    ["2026-11-01T17:00:00Z", "2026-11-02T20:00:00Z"],
  );
});

test("meetups - filters JSON and RSS with ?upcoming=true", async () => {
  const all = await meetups(new Request("http://localhost/x/meetups")).json<
    Meetup[]
  >();
  const res = meetups(new Request("http://localhost/x/meetups?upcoming=true"));
  assert.deepEqual(await res.json(), upcoming(all, Date.now()));

  const rss = await meetups(
    new Request("http://localhost/x/meetups?upcoming=true&format=rss"),
  ).text();
  assert.equal(
    rss.split("<item>").length - 1,
    upcoming(all, Date.now()).length,
  );
});
