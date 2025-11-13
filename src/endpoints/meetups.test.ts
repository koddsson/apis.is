import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import meetups from "./meetups.ts";

Deno.test("meetups - returns meetup data", async () => {
  const req = new Request("http://localhost/x/meetups");
  const res = meetups(req);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");

  const data = await res.json();
  assertEquals(Array.isArray(data), true);
});

Deno.test("meetups - returns compact JSON by default", async () => {
  const req = new Request("http://localhost/x/meetups");
  const res = meetups(req);

  const text = await res.text();
  assertEquals(text.includes("\n"), false);
});

Deno.test("meetups - returns pretty JSON when pretty=true", async () => {
  const req = new Request("http://localhost/x/meetups?pretty=true");
  const res = meetups(req);

  const text = await res.text();
  assertEquals(text.includes("\n"), true);
});

Deno.test("meetups - returns RSS feed when format=rss", async () => {
  const req = new Request("http://localhost/x/meetups?format=rss");
  const res = meetups(req);

  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Content-Type"),
    "application/rss+xml; charset=utf-8",
  );
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");

  const text = await res.text();
  assertStringIncludes(text, '<?xml version="1.0" encoding="UTF-8"?>');
  assertStringIncludes(text, '<rss version="2.0"');
  assertStringIncludes(text, "<title>Icelandic Tech Meetups</title>");
  assertStringIncludes(text, "<channel>");
});

Deno.test("meetups - RSS feed contains meetup items", async () => {
  const req = new Request("http://localhost/x/meetups?format=rss");
  const res = meetups(req);

  const text = await res.text();
  assertStringIncludes(text, "<item>");
  assertStringIncludes(text, "</item>");
  assertStringIncludes(text, "<link>");
  assertStringIncludes(text, "<description>");
});

Deno.test("meetups - returns JSON by default without format parameter", async () => {
  const req = new Request("http://localhost/x/meetups");
  const res = meetups(req);

  const contentType = res.headers.get("Content-Type");
  // Should not return RSS content type
  assertEquals(contentType === "application/rss+xml; charset=utf-8", false);

  const data = await res.json();
  assertEquals(Array.isArray(data), true);
});

Deno.test("meetups - has correct meta information", () => {
  assertEquals(meetups.meta?.endpoint, "/x/meetups");
  assertStringIncludes(
    meetups.meta?.description || "",
    "List of Icelandic tech meetups and community groups",
  );
  assertStringIncludes(
    meetups.meta?.description || "",
    "RSS",
  );
});
