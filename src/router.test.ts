import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Router } from "./router.ts";

Deno.test("Router - adds and routes GET requests", async () => {
  const router = new Router();
  const handler = () => new Response("test");
  router.add("GET", "/test", handler);

  const req = new Request("http://localhost/test");
  const res = await router.route(req);

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "test");
});

Deno.test("Router - returns 404 for unmatched routes", async () => {
  const router = new Router();
  const req = new Request("http://localhost/nonexistent");
  const res = await router.route(req);

  assertEquals(res.status, 404);
});

Deno.test("Router - handles path parameters", async () => {
  const router = new Router();
  let capturedParams: Record<string, string> = {};

  const handler = (_req: Request, params: Record<string, string>) => {
    capturedParams = params;
    return new Response("ok");
  };

  router.add("GET", "/user/{:id}", handler);

  const req = new Request("http://localhost/user/123");
  await router.route(req);

  assertEquals(capturedParams.id, "123");
});

Deno.test("Router - handles optional parameters", async () => {
  const router = new Router();
  let capturedParams: Record<string, string> = {};

  const handler = (_req: Request, params: Record<string, string>) => {
    capturedParams = params;
    return new Response("ok");
  };

  router.add("GET", "/item/{:code}?", handler);

  // With parameter
  const req1 = new Request("http://localhost/item/ABC");
  await router.route(req1);
  assertEquals(capturedParams.code, "ABC");

  // Without parameter
  capturedParams = {};
  const req2 = new Request("http://localhost/item/");
  await router.route(req2);
  assertEquals(capturedParams.code, undefined);
});

Deno.test("Router - supports POST requests", async () => {
  const router = new Router();
  const handler = () => new Response("posted");
  router.add("POST", "/api/data", handler);

  const req = new Request("http://localhost/api/data", { method: "POST" });
  const res = await router.route(req);

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "posted");
});

Deno.test("Router - supports PUT requests", async () => {
  const router = new Router();
  const handler = () => new Response("updated");
  router.add("PUT", "/api/data", handler);

  const req = new Request("http://localhost/api/data", { method: "PUT" });
  const res = await router.route(req);

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "updated");
});

Deno.test("Router - getEndpoints returns endpoints with meta", () => {
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

  assertEquals(endpoints.length, 2);
  assertEquals(endpoints[0].endpoint, "/api/test");
  assertEquals(endpoints[0].description, "Test endpoint");
  assertEquals(endpoints[1].endpoint, "/api/other");
  assertEquals(endpoints[1].description, "Other endpoint");
});

Deno.test("Router - getEndpoints returns empty array when no endpoints", () => {
  const router = new Router();
  const endpoints = router.getEndpoints();

  assertEquals(endpoints.length, 0);
});

Deno.test("Router - handles async handlers", async () => {
  const router = new Router();
  const handler = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response("async result");
  };
  router.add("GET", "/async", handler);

  const req = new Request("http://localhost/async");
  const res = await router.route(req);

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "async result");
});

Deno.test("Router - handles multiple routes", async () => {
  const router = new Router();
  router.add("GET", "/route1", () => new Response("route1"));
  router.add("GET", "/route2", () => new Response("route2"));
  router.add("GET", "/route3", () => new Response("route3"));

  const req1 = new Request("http://localhost/route1");
  const res1 = await router.route(req1);
  assertEquals(await res1.text(), "route1");

  const req2 = new Request("http://localhost/route2");
  const res2 = await router.route(req2);
  assertEquals(await res2.text(), "route2");

  const req3 = new Request("http://localhost/route3");
  const res3 = await router.route(req3);
  assertEquals(await res3.text(), "route3");
});

Deno.test("Router - handles errors in handlers gracefully", async () => {
  const router = new Router();
  const handler = () => {
    throw new Error("Handler error");
  };
  router.add("GET", "/error", handler);

  // Ensure we're not in production to avoid creating real issues
  const originalDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  try {
    if (originalDeploymentId) Deno.env.delete("DENO_DEPLOYMENT_ID");

    const req = new Request("http://localhost/error");
    const res = await router.route(req);

    assertEquals(res.status, 500);
    const json = await res.json();
    assertEquals(json.error, "Internal Server Error");
  } finally {
    if (originalDeploymentId) {
      Deno.env.set("DENO_DEPLOYMENT_ID", originalDeploymentId);
    }
  }
});

Deno.test("Router - handles async errors in handlers", async () => {
  const router = new Router();
  const handler = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new Error("Async handler error");
  };
  router.add("GET", "/async-error", handler);

  const originalDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  try {
    if (originalDeploymentId) Deno.env.delete("DENO_DEPLOYMENT_ID");

    const req = new Request("http://localhost/async-error");
    const res = await router.route(req);

    assertEquals(res.status, 500);
    const json = await res.json();
    assertEquals(json.error, "Internal Server Error");
  } finally {
    if (originalDeploymentId) {
      Deno.env.set("DENO_DEPLOYMENT_ID", originalDeploymentId);
    }
  }
});
