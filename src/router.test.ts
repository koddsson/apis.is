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

  router.add("GET", "/item/{:code}?", handler);

  // With parameter
  const req1 = new Request("http://localhost/item/ABC");
  await router.route(req1);
  assert.deepEqual(capturedParams.code, "ABC");

  // Without parameter
  capturedParams = {};
  const req2 = new Request("http://localhost/item/");
  await router.route(req2);
  assert.deepEqual(capturedParams.code, undefined);
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

test("Router - logs successful requests in Common Log Format", async () => {
  const router = new Router();

  // Add a simple logging middleware for the test
  const logMiddleware = async (req: Request, next: () => Promise<Response>) => {
    const response = await next();
    const responseClone = response.clone();
    const body = await responseClone.text();
    const responseSize = new TextEncoder().encode(body).length;
    const url = new URL(req.url);
    console.log(
      `- - - [date] "${req.method} ${url.pathname}${url.search} HTTP/1.1" ${response.status} ${responseSize}`,
    );
    return response;
  };
  router.use(logMiddleware);

  const handler = () => new Response("test");
  router.add("GET", "/test", handler);

  // Capture console.log output
  const originalLog = console.log;
  let loggedMessage = "";
  console.log = (msg: string) => {
    loggedMessage = msg;
  };

  try {
    const req = new Request("http://localhost/test");
    await router.route(req);

    // Verify Common Log Format: host - - [date] "method path protocol" status size
    assert.include(loggedMessage, "GET /test HTTP/1.1");
    assert.include(loggedMessage, "200");
    assert.include(loggedMessage, "- - [");
    assert.include(loggedMessage, "]");
    assert.include(loggedMessage, '"');
  } finally {
    console.log = originalLog;
  }
});

test("Router - logs 404 responses in Common Log Format", async () => {
  const router = new Router();

  // Add a simple logging middleware for the test
  const logMiddleware = async (req: Request, next: () => Promise<Response>) => {
    const response = await next();
    const responseClone = response.clone();
    const body = await responseClone.text();
    const responseSize = new TextEncoder().encode(body).length;
    const url = new URL(req.url);
    console.log(
      `- - - [date] "${req.method} ${url.pathname}${url.search} HTTP/1.1" ${response.status} ${responseSize}`,
    );
    return response;
  };
  router.use(logMiddleware);

  const originalLog = console.log;
  let loggedMessage = "";
  console.log = (msg: string) => {
    loggedMessage = msg;
  };

  try {
    const req = new Request("http://localhost/nonexistent");
    await router.route(req);

    assert.include(loggedMessage, "GET /nonexistent HTTP/1.1");
    assert.include(loggedMessage, "404");
    assert.include(loggedMessage, "- - [");
  } finally {
    console.log = originalLog;
  }
});

test("Router - logs error responses with 500 status in Common Log Format", async () => {
  const router = new Router();

  // Add a simple logging middleware for the test
  const logMiddleware = async (req: Request, next: () => Promise<Response>) => {
    const response = await next();
    const responseClone = response.clone();
    const body = await responseClone.text();
    const responseSize = new TextEncoder().encode(body).length;
    const url = new URL(req.url);
    console.log(
      `- - - [date] "${req.method} ${url.pathname}${url.search} HTTP/1.1" ${response.status} ${responseSize}`,
    );
    return response;
  };
  router.use(logMiddleware);

  const handler = () => {
    throw new Error("Test error");
  };
  router.add("GET", "/error", handler);

  const originalLog = console.log;
  let loggedMessage = "";
  console.log = (msg: string) => {
    loggedMessage = msg;
  };

  try {
    const req = new Request("http://localhost/error");
    await router.route(req);

    assert.include(loggedMessage, "GET /error HTTP/1.1");
    assert.include(loggedMessage, "500");
    assert.include(loggedMessage, "- - [");
  } finally {
    console.log = originalLog;
  }
});

test("Router - logs different HTTP methods", async () => {
  const router = new Router();

  // Add a simple logging middleware for the test
  const logMiddleware = async (req: Request, next: () => Promise<Response>) => {
    const response = await next();
    const responseClone = response.clone();
    const body = await responseClone.text();
    const responseSize = new TextEncoder().encode(body).length;
    const url = new URL(req.url);
    console.log(
      `- - - [date] "${req.method} ${url.pathname}${url.search} HTTP/1.1" ${response.status} ${responseSize}`,
    );
    return response;
  };
  router.use(logMiddleware);

  router.add("POST", "/api/data", () => new Response("posted"));
  router.add("PUT", "/api/data", () => new Response("updated"));

  const originalLog = console.log;
  const loggedMessages: string[] = [];
  console.log = (msg: string) => {
    loggedMessages.push(msg);
  };

  try {
    const postReq = new Request("http://localhost/api/data", {
      method: "POST",
    });
    await router.route(postReq);

    const putReq = new Request("http://localhost/api/data", { method: "PUT" });
    await router.route(putReq);

    assert.deepEqual(loggedMessages.length, 2);
    assert.include(loggedMessages[0], "POST");
    assert.include(loggedMessages[0], "/api/data");
    assert.include(loggedMessages[1], "PUT");
    assert.include(loggedMessages[1], "/api/data");
  } finally {
    console.log = originalLog;
  }
});
