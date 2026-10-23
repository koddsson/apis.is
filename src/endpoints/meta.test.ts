import { assert, test } from "vitest";
import { Router } from "../router.ts";
import meta from "./meta.ts";

type Endpoints = {
  endpoints: Array<{ endpoint: string; description: string }>;
};

test("meta - returns list of endpoints", async () => {
  const router = new Router();

  const handler1 = () => new Response("ok");
  handler1.meta = { endpoint: "/x/test1", description: "Test 1" };

  const handler2 = () => new Response("ok");
  handler2.meta = { endpoint: "/x/test2", description: "Test 2" };

  router.add("GET", "/x/test1", handler1);
  router.add("GET", "/x/test2", handler2);

  const metaHandler = meta(router);
  const req = new Request("http://localhost/");
  const res = metaHandler(req, {});

  assert.deepEqual(res.status, 200);
  assert.deepEqual(res.headers.get("Access-Control-Allow-Origin"), "*");

  const data = await res.json<Endpoints>();
  assert.deepEqual(data.endpoints.length, 2);
  assert.deepEqual(data.endpoints[0].endpoint, "/x/test1");
  assert.deepEqual(data.endpoints[0].description, "Test 1");
  assert.deepEqual(data.endpoints[1].endpoint, "/x/test2");
  assert.deepEqual(data.endpoints[1].description, "Test 2");
});

test("meta - returns compact JSON by default", async () => {
  const router = new Router();
  const metaHandler = meta(router);

  const req = new Request("http://localhost/");
  const res = metaHandler(req, {});

  const text = await res.text();
  assert.deepEqual(text.includes("\n"), false);
});

test("meta - returns pretty JSON when pretty=true", async () => {
  const router = new Router();
  const metaHandler = meta(router);

  const req = new Request("http://localhost/?pretty=true");
  const res = metaHandler(req, {});

  const text = await res.text();
  assert.deepEqual(text.includes("\n"), true);
});

test("meta - returns empty endpoints array when no endpoints", async () => {
  const router = new Router();
  const metaHandler = meta(router);

  const req = new Request("http://localhost/");
  const res = metaHandler(req, {});

  const data = await res.json<Endpoints>();
  assert.deepEqual(data.endpoints.length, 0);
});
