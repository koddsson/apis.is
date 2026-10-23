import { assert, test } from "vitest";
import meetups from "./meetups.ts";

test("meetups - returns meetup data", async () => {
  const req = new Request("http://localhost/x/meetups");
  const res = meetups(req);

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
