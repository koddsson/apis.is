import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Router } from "./router.ts";
import { commonLogMiddleware } from "./middleware.ts";

Deno.test("Middleware - executes middleware before handler", async () => {
  const router = new Router();
  const order: string[] = [];

  const middleware = async (
    _req: Request,
    next: () => Promise<Response>,
  ) => {
    order.push("middleware");
    return await next();
  };

  router.use(middleware);
  router.add("GET", "/test", () => {
    order.push("handler");
    return new Response("ok");
  });

  const req = new Request("http://localhost/test");
  await router.route(req);

  assertEquals(order, ["middleware", "handler"]);
});

Deno.test("Middleware - executes multiple middleware in order", async () => {
  const router = new Router();
  const order: string[] = [];

  const middleware1 = async (
    _req: Request,
    next: () => Promise<Response>,
  ) => {
    order.push("middleware1");
    return await next();
  };

  const middleware2 = async (
    _req: Request,
    next: () => Promise<Response>,
  ) => {
    order.push("middleware2");
    return await next();
  };

  router.use(middleware1);
  router.use(middleware2);
  router.add("GET", "/test", () => {
    order.push("handler");
    return new Response("ok");
  });

  const req = new Request("http://localhost/test");
  await router.route(req);

  assertEquals(order, ["middleware1", "middleware2", "handler"]);
});

Deno.test("Middleware - can modify response", async () => {
  const router = new Router();

  const middleware = async (
    _req: Request,
    next: () => Promise<Response>,
  ) => {
    const response = await next();
    return new Response("modified", {
      status: response.status,
      headers: response.headers,
    });
  };

  router.use(middleware);
  router.add("GET", "/test", () => new Response("original"));

  const req = new Request("http://localhost/test");
  const res = await router.route(req);

  assertEquals(await res.text(), "modified");
});

Deno.test("Middleware - can short-circuit the chain", async () => {
  const router = new Router();
  let handlerCalled = false;

  const middleware = async (
    _req: Request,
    _next: () => Promise<Response>,
  ) => {
    return new Response("short-circuited", { status: 403 });
  };

  router.use(middleware);
  router.add("GET", "/test", () => {
    handlerCalled = true;
    return new Response("ok");
  });

  const req = new Request("http://localhost/test");
  const res = await router.route(req);

  assertEquals(await res.text(), "short-circuited");
  assertEquals(res.status, 403);
  assertEquals(handlerCalled, false);
});

Deno.test("Middleware - executes on 404 responses", async () => {
  const router = new Router();
  let middlewareCalled = false;

  const middleware = async (
    _req: Request,
    next: () => Promise<Response>,
  ) => {
    middlewareCalled = true;
    return await next();
  };

  router.use(middleware);

  const req = new Request("http://localhost/nonexistent");
  const res = await router.route(req);

  assertEquals(res.status, 404);
  assertEquals(middlewareCalled, true);
});

Deno.test("commonLogMiddleware - logs requests in Common Log Format", async () => {
  const router = new Router();
  router.use(commonLogMiddleware);
  router.add("GET", "/test", () => new Response("test response"));

  const originalLog = console.log;
  let loggedMessage = "";
  console.log = (msg: string) => {
    loggedMessage = msg;
  };

  try {
    const req = new Request("http://localhost/test");
    await router.route(req);

    assertStringIncludes(loggedMessage, "GET /test HTTP/1.1");
    assertStringIncludes(loggedMessage, "200");
    assertStringIncludes(loggedMessage, "- - [");
    assertStringIncludes(loggedMessage, "]");
  } finally {
    console.log = originalLog;
  }
});

Deno.test("commonLogMiddleware - logs with query parameters", async () => {
  const router = new Router();
  router.use(commonLogMiddleware);
  router.add("GET", "/search", () => new Response("results"));

  const originalLog = console.log;
  let loggedMessage = "";
  console.log = (msg: string) => {
    loggedMessage = msg;
  };

  try {
    const req = new Request("http://localhost/search?q=test&limit=10");
    await router.route(req);

    assertStringIncludes(loggedMessage, "GET /search?q=test&limit=10 HTTP/1.1");
    assertStringIncludes(loggedMessage, "200");
  } finally {
    console.log = originalLog;
  }
});

Deno.test("commonLogMiddleware - logs error responses", async () => {
  const router = new Router();
  router.use(commonLogMiddleware);

  // Disable error reporting for this test
  const originalDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  try {
    if (originalDeploymentId) Deno.env.delete("DENO_DEPLOYMENT_ID");

    router.add("GET", "/error", () => {
      throw new Error("Test error");
    });

    const originalLog = console.log;
    let loggedMessage = "";
    console.log = (msg: string) => {
      loggedMessage = msg;
    };

    try {
      const req = new Request("http://localhost/error");
      await router.route(req);

      assertStringIncludes(loggedMessage, "GET /error HTTP/1.1");
      assertStringIncludes(loggedMessage, "500");
    } finally {
      console.log = originalLog;
    }
  } finally {
    if (originalDeploymentId) {
      Deno.env.set("DENO_DEPLOYMENT_ID", originalDeploymentId);
    }
  }
});
