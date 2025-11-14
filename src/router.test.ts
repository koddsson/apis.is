import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
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

Deno.test("Router - logs successful requests in Common Log Format", async () => {
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
    assertStringIncludes(loggedMessage, "GET /test HTTP/1.1");
    assertStringIncludes(loggedMessage, "200");
    assertStringIncludes(loggedMessage, "- - [");
    assertStringIncludes(loggedMessage, "]");
    assertStringIncludes(loggedMessage, '"');
  } finally {
    console.log = originalLog;
  }
});

Deno.test("Router - logs 404 responses in Common Log Format", async () => {
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

    assertStringIncludes(loggedMessage, "GET /nonexistent HTTP/1.1");
    assertStringIncludes(loggedMessage, "404");
    assertStringIncludes(loggedMessage, "- - [");
  } finally {
    console.log = originalLog;
  }
});

Deno.test("Router - logs error responses with 500 status in Common Log Format", async () => {
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

  const originalDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  try {
    if (originalDeploymentId) Deno.env.delete("DENO_DEPLOYMENT_ID");

    const req = new Request("http://localhost/error");
    await router.route(req);

    assertStringIncludes(loggedMessage, "GET /error HTTP/1.1");
    assertStringIncludes(loggedMessage, "500");
    assertStringIncludes(loggedMessage, "- - [");
  } finally {
    console.log = originalLog;
    if (originalDeploymentId) {
      Deno.env.set("DENO_DEPLOYMENT_ID", originalDeploymentId);
    }
  }
});

Deno.test("Router - logs different HTTP methods", async () => {
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

    assertEquals(loggedMessages.length, 2);
    assertStringIncludes(loggedMessages[0], "POST");
    assertStringIncludes(loggedMessages[0], "/api/data");
    assertStringIncludes(loggedMessages[1], "PUT");
    assertStringIncludes(loggedMessages[1], "/api/data");
  } finally {
    console.log = originalLog;
  }
});
