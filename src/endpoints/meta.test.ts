import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Router } from "../router.ts";
import meta from "./meta.ts";

Deno.test("meta - returns list of endpoints", async () => {
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

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");

  const data = await res.json();
  assertEquals(data.endpoints.length, 2);
  assertEquals(data.endpoints[0].endpoint, "/x/test1");
  assertEquals(data.endpoints[0].description, "Test 1");
  assertEquals(data.endpoints[1].endpoint, "/x/test2");
  assertEquals(data.endpoints[1].description, "Test 2");
});

Deno.test("meta - returns compact JSON by default", async () => {
  const router = new Router();
  const metaHandler = meta(router);

  const req = new Request("http://localhost/");
  const res = metaHandler(req, {});

  const text = await res.text();
  assertEquals(text.includes("\n"), false);
});

Deno.test("meta - returns pretty JSON when pretty=true", async () => {
  const router = new Router();
  const metaHandler = meta(router);

  const req = new Request("http://localhost/?pretty=true");
  const res = metaHandler(req, {});

  const text = await res.text();
  assertEquals(text.includes("\n"), true);
});

Deno.test("meta - returns empty endpoints array when no endpoints", async () => {
  const router = new Router();
  const metaHandler = meta(router);

  const req = new Request("http://localhost/");
  const res = metaHandler(req, {});

  const data = await res.json();
  assertEquals(data.endpoints.length, 0);
});
