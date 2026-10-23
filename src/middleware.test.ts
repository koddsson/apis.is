import { assert, test } from "vitest";
import { commonLogMiddleware } from "./middleware.ts";
import { Router } from "./router.ts";

test("Middleware - executes middleware before handler", async () => {
  const router = new Router();
  const order: string[] = [];

  const middleware = async (_req: Request, next: () => Promise<Response>) => {
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

  assert.deepEqual(order, ["middleware", "handler"]);
});

test("Middleware - executes multiple middleware in order", async () => {
  const router = new Router();
  const order: string[] = [];

  const middleware1 = async (_req: Request, next: () => Promise<Response>) => {
    order.push("middleware1");
    return await next();
  };

  const middleware2 = async (_req: Request, next: () => Promise<Response>) => {
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

  assert.deepEqual(order, ["middleware1", "middleware2", "handler"]);
});

test("Middleware - can modify response", async () => {
  const router = new Router();

  const middleware = async (_req: Request, next: () => Promise<Response>) => {
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

  assert.deepEqual(await res.text(), "modified");
});

test("Middleware - can short-circuit the chain", async () => {
  const router = new Router();
  let handlerCalled = false;

  const middleware = (_req: Request, _next: () => Promise<Response>) => {
    return Promise.resolve(new Response("short-circuited", { status: 403 }));
  };

  router.use(middleware);
  router.add("GET", "/test", () => {
    handlerCalled = true;
    return new Response("ok");
  });

  const req = new Request("http://localhost/test");
  const res = await router.route(req);

  assert.deepEqual(await res.text(), "short-circuited");
  assert.deepEqual(res.status, 403);
  assert.deepEqual(handlerCalled, false);
});

test("Middleware - executes on 404 responses", async () => {
  const router = new Router();
  let middlewareCalled = false;

  const middleware = async (_req: Request, next: () => Promise<Response>) => {
    middlewareCalled = true;
    return await next();
  };

  router.use(middleware);

  const req = new Request("http://localhost/nonexistent");
  const res = await router.route(req);

  assert.deepEqual(res.status, 404);
  assert.deepEqual(middlewareCalled, true);
});

test("commonLogMiddleware - logs requests in Common Log Format", async () => {
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

    assert.include(loggedMessage, "GET /test HTTP/1.1");
    assert.include(loggedMessage, "200");
    assert.include(loggedMessage, "- - [");
    assert.include(loggedMessage, "]");
  } finally {
    console.log = originalLog;
  }
});

test("commonLogMiddleware - logs Cloudflare client IP", async () => {
  const router = new Router();
  router.use(commonLogMiddleware);
  router.add("GET", "/test", () => new Response("ok"));

  const originalLog = console.log;
  let loggedMessage = "";
  console.log = (msg: string) => {
    loggedMessage = msg;
  };

  try {
    const req = new Request("http://localhost/test", {
      headers: {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1",
      },
    });
    await router.route(req);

    assert.include(loggedMessage, "203.0.113.7 - - [");
  } finally {
    console.log = originalLog;
  }
});

test("commonLogMiddleware - logs with query parameters", async () => {
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

    assert.include(loggedMessage, "GET /search?q=test&limit=10 HTTP/1.1");
    assert.include(loggedMessage, "200");
  } finally {
    console.log = originalLog;
  }
});

test("commonLogMiddleware - logs error responses", async () => {
  const router = new Router();
  router.use(commonLogMiddleware);
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

    assert.include(loggedMessage, "GET /error HTTP/1.1");
    assert.include(loggedMessage, "500");
  } finally {
    console.log = originalLog;
  }
});
