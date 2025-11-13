import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capitalizeFirstLetter, response } from "./utils.ts";

Deno.test("capitalizeFirstLetter - capitalizes first letter of string", () => {
  assertEquals(capitalizeFirstLetter("hello"), "Hello");
  assertEquals(capitalizeFirstLetter("world"), "World");
  assertEquals(capitalizeFirstLetter("a"), "A");
});

Deno.test("capitalizeFirstLetter - handles empty string", () => {
  assertEquals(capitalizeFirstLetter(""), "");
});

Deno.test("capitalizeFirstLetter - handles already capitalized string", () => {
  assertEquals(capitalizeFirstLetter("Hello"), "Hello");
});

Deno.test("capitalizeFirstLetter - handles special characters", () => {
  assertEquals(capitalizeFirstLetter("123abc"), "123abc");
  assertEquals(capitalizeFirstLetter("!hello"), "!hello");
});

Deno.test("response - returns Response with JSON data", () => {
  const data = { test: "value" };
  const res = response(data);

  assertEquals(res instanceof Response, true);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("response - returns compact JSON by default", async () => {
  const data = { test: "value", nested: { key: "val" } };
  const res = response(data);

  const text = await res.text();
  assertEquals(text, JSON.stringify(data));
  assertEquals(text.includes("\n"), false);
});

Deno.test("response - returns pretty JSON when pretty=true", async () => {
  const data = { test: "value", nested: { key: "val" } };
  const res = response(data, true);

  const text = await res.text();
  assertEquals(text, JSON.stringify(data, null, 2));
  assertEquals(text.includes("\n"), true);
});

Deno.test("response - handles arrays", async () => {
  const data = [1, 2, 3];
  const res = response(data);

  const text = await res.text();
  assertEquals(text, "[1,2,3]");
});
