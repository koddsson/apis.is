import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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

Deno.test("meetups - has correct meta information", () => {
  assertEquals(meetups.meta?.endpoint, "/x/meetups");
  assertEquals(
    meetups.meta?.description,
    "List of Icelandic tech meetups and community groups.",
  );
});
