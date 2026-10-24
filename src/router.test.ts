import { assert, test } from "vitest";
import { Router } from "./router.ts";

test("Router - adds and routes GET requests", async () => {
  const router = new Router();
  const handler = () => new Response("test");
  router.add("GET", "/test", handler);

  const req = new Request("http://localhost/test");
  const res = await router.route(req);

  assert.deepEqual(res.status, 200);
  assert.deepEqual(await res.text(), "test");
});

test("Router - returns 404 for unmatched routes", async () => {
  const router = new Router();
  const req = new Request("http://localhost/nonexistent");
  const res = await router.route(req);

  assert.deepEqual(res.status, 404);
});

test("Router - handles path parameters", async () => {
  const router = new Router();
  let capturedParams: Record<string, string> = {};

  const handler = (_req: Request, params: Record<string, string>) => {
    capturedParams = params;
    return new Response("ok");
  };

  router.add("GET", "/user/{:id}", handler);

  const req = new Request("http://localhost/user/123");
  await router.route(req);

  assert.deepEqual(capturedParams.id, "123");
});

test("Router - handles optional parameters", async () => {
  const router = new Router();
  let capturedParams: Record<string, string> = {};

  const handler = (_req: Request, params: Record<string, string>) => {
    capturedParams = params;
    return new Response("ok");
  };

  router.add("GET", "/item{/:code}?", handler);

  // With parameter
  const req1 = new Request("http://localhost/item/ABC");
  await router.route(req1);
  assert.deepEqual(capturedParams.code, "ABC");

  // Without parameter, with or without a trailing slash
  for (const path of ["/item", "/item/"]) {
    capturedParams = { code: "stale" };
    const res = await router.route(new Request(`http://localhost${path}`));
    assert.equal(res.status, 200, path);
    assert.deepEqual(capturedParams.code, undefined, path);
  }
});

test("Router - ignores trailing slashes", async () => {
  const router = new Router();
  router.add("GET", "/user/{:id}", (_req, params) => new Response(params.id));
  router.add("GET", "/", () => new Response("root"));

  const user = await router.route(new Request("http://localhost/user/42//"));
  assert.equal(await user.text(), "42");
  const root = await router.route(new Request("http://localhost/"));
  assert.equal(await root.text(), "root");
});

test("Router - supports POST requests", async () => {
  const router = new Router();
  const handler = () => new Response("posted");
  router.add("POST", "/api/data", handler);

  const req = new Request("http://localhost/api/data", { method: "POST" });
  const res = await router.route(req);

  assert.deepEqual(res.status, 200);
  assert.deepEqual(await res.text(), "posted");
});

test("Router - supports PUT requests", async () => {
  const router = new Router();
  const handler = () => new Response("updated");
  router.add("PUT", "/api/data", handler);

  const req = new Request("http://localhost/api/data", { method: "PUT" });
  const res = await router.route(req);

  assert.deepEqual(res.status, 200);
  assert.deepEqual(await res.text(), "updated");
});

test("Router - getEndpoints returns endpoints with meta", () => {
  const router = new Router();

  const handler1 = () => new Response("ok");
  handler1.meta = { endpoint: "/api/test", description: "Test endpoint" };

  const handler2 = () => new Response("ok");
  handler2.meta = { endpoint: "/api/other", description: "Other endpoint" };

  const handler3 = () => new Response("ok");
  // No meta

  router.add("GET", "/api/test", handler1);
  router.add("GET", "/api/other", handler2);
  router.add("GET", "/api/nometa", handler3);

  const endpoints = router.getEndpoints();

  assert.deepEqual(endpoints.length, 2);
  assert.deepEqual(endpoints[0].endpoint, "/api/test");
  assert.deepEqual(endpoints[0].description, "Test endpoint");
  assert.deepEqual(endpoints[1].endpoint, "/api/other");
  assert.deepEqual(endpoints[1].description, "Other endpoint");
});

test("Router - getEndpoints returns empty array when no endpoints", () => {
  const router = new Router();
  const endpoints = router.getEndpoints();

  assert.deepEqual(endpoints.length, 0);
});

test("Router - handles async handlers", async () => {
  const router = new Router();
  const handler = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response("async result");
  };
  router.add("GET", "/async", handler);

  const req = new Request("http://localhost/async");
  const res = await router.route(req);

  assert.deepEqual(res.status, 200);
  assert.deepEqual(await res.text(), "async result");
});

test("Router - handles multiple routes", async () => {
  const router = new Router();
  router.add("GET", "/route1", () => new Response("route1"));
  router.add("GET", "/route2", () => new Response("route2"));
  router.add("GET", "/route3", () => new Response("route3"));

  const req1 = new Request("http://localhost/route1");
  const res1 = await router.route(req1);
  assert.deepEqual(await res1.text(), "route1");

  const req2 = new Request("http://localhost/route2");
  const res2 = await router.route(req2);
  assert.deepEqual(await res2.text(), "route2");

  const req3 = new Request("http://localhost/route3");
  const res3 = await router.route(req3);
  assert.deepEqual(await res3.text(), "route3");
});

test("Router - handles errors in handlers gracefully", async () => {
  const router = new Router();
  const handler = () => {
    throw new Error("Handler error");
  };
  router.add("GET", "/error", handler);

  const req = new Request("http://localhost/error");
  const res = await router.route(req);

  assert.deepEqual(res.status, 500);
  const json = await res.json<{ error: string }>();
  assert.deepEqual(json.error, "Internal Server Error");
});

test("Router - handles async errors in handlers", async () => {
  const router = new Router();
  const handler = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new Error("Async handler error");
  };
  router.add("GET", "/async-error", handler);

  const req = new Request("http://localhost/async-error");
  const res = await router.route(req);

  assert.deepEqual(res.status, 500);
  const json = await res.json<{ error: string }>();
  assert.deepEqual(json.error, "Internal Server Error");
});

test("Router - answers HEAD like GET", async () => {
  const router = new Router();
  router.add("GET", "/test", () => new Response("ok"));

  const res = await router.route(
    new Request("http://localhost/test", { method: "HEAD" }),
  );
  assert.equal(res.status, 200);
});

test("Router - returns 404 for methods without routes", async () => {
  const router = new Router();
  router.add("GET", "/test", () => new Response("ok"));

  for (const method of ["OPTIONS", "DELETE", "PATCH"]) {
    const res = await router.route(
      new Request("http://localhost/test", { method }),
    );
    assert.equal(res.status, 404, method);
  }
});
