import { assert, test } from "vitest";
import { capitalizeFirstLetter, response } from "./utils.ts";

test("capitalizeFirstLetter - capitalizes first letter of string", () => {
  assert.deepEqual(capitalizeFirstLetter("hello"), "Hello");
  assert.deepEqual(capitalizeFirstLetter("world"), "World");
  assert.deepEqual(capitalizeFirstLetter("a"), "A");
});

test("capitalizeFirstLetter - handles empty string", () => {
  assert.deepEqual(capitalizeFirstLetter(""), "");
});

test("capitalizeFirstLetter - handles already capitalized string", () => {
  assert.deepEqual(capitalizeFirstLetter("Hello"), "Hello");
});

test("capitalizeFirstLetter - handles special characters", () => {
  assert.deepEqual(capitalizeFirstLetter("123abc"), "123abc");
  assert.deepEqual(capitalizeFirstLetter("!hello"), "!hello");
});

test("response - returns Response with JSON data", () => {
  const data = { test: "value" };
  const res = response(data);

  assert.deepEqual(res instanceof Response, true);
  assert.deepEqual(res.headers.get("Access-Control-Allow-Origin"), "*");
});

test("response - returns compact JSON by default", async () => {
  const data = { test: "value", nested: { key: "val" } };
  const res = response(data);

  const text = await res.text();
  assert.deepEqual(text, JSON.stringify(data));
  assert.deepEqual(text.includes("\n"), false);
});

test("response - returns pretty JSON when pretty=true", async () => {
  const data = { test: "value", nested: { key: "val" } };
  const res = response(data, true);

  const text = await res.text();
  assert.deepEqual(text, JSON.stringify(data, null, 2));
  assert.deepEqual(text.includes("\n"), true);
});

test("response - handles arrays", async () => {
  const data = [1, 2, 3];
  const res = response(data);

  const text = await res.text();
  assert.deepEqual(text, "[1,2,3]");
});
