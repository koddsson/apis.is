import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import car from "./car.ts";

const mockCarResponse = {
  data: {
    publicVehicleSearch: {
      permno: "ABC12",
      make: "Toyota",
      vehicleCommercialName: "Corolla",
      color: "Blue",
    },
  },
};

beforeEach(() => {
  clearCache();
});

test("car - fetches and returns vehicle data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockCarResponse), { status: 200 }),
    );
  };

  try {
    const req = new Request("http://localhost/x/car/ABC12");
    const res = await car(req, { number: "ABC12" });
    assert.isUndefined(validate(car.health.schema, await res.clone().json()));

    assert.deepEqual(res.status, 200);
    assert.deepEqual(res.headers.get("Access-Control-Allow-Origin"), "*");

    const data = await res.json<Record<string, string>>();
    assert.deepEqual(typeof data, "object");
    assert.deepEqual(data.permno, "ABC12");
    assert.deepEqual(data.make, "Toyota");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("car - includes number parameter in API call", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";

  globalThis.fetch = (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = (init?.body as string) ?? "";
    return Promise.resolve(
      new Response(JSON.stringify(mockCarResponse), { status: 200 }),
    );
  };

  try {
    const req = new Request("http://localhost/x/car/XYZ99");
    await car(req, { number: "XYZ99" });

    assert.include(requestBody, "XYZ99");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("car - returns compact JSON by default", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockCarResponse), { status: 200 }),
    );
  };

  try {
    const req = new Request("http://localhost/x/car/ABC12");
    const res = await car(req, { number: "ABC12" });

    const text = await res.text();
    assert.deepEqual(text.includes("\n"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("car - returns pretty JSON when pretty=true", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockCarResponse), { status: 200 }),
    );
  };

  try {
    const req = new Request("http://localhost/x/car/ABC12?pretty=true");
    const res = await car(req, { number: "ABC12" });

    const text = await res.text();
    assert.deepEqual(text.includes("\n"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("car - has correct meta information", () => {
  assert.deepEqual(car.meta?.endpoint, "/x/car/{number}");
  assert.include(car.meta?.description || "", "Vehicle information");
});

test("car - health schema requires vehicle data", () => {
  assert.isUndefined(validate(car.health.schema, { permno: "ISE92", co2: 1 }));
  assert.include(validate(car.health.schema, null) ?? "", "(root)");
  assert.include(validate(car.health.schema, {}) ?? "", "permno");
});

test("car - caches each vehicle and sets Cache-Control", async () => {
  const originalFetch = globalThis.fetch;
  const searches: string[] = [];
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    searches.push(JSON.parse(init?.body as string).variables.input.search);
    return Promise.resolve(new Response(JSON.stringify(mockCarResponse)));
  };

  try {
    const first = await car(new Request("http://localhost/x/car/ABC12"), {
      number: "ABC12",
    });
    await car(new Request("http://localhost/x/car/ABC12"), { number: "ABC12" });
    await car(new Request("http://localhost/x/car/XYZ99"), { number: "XYZ99" });

    assert.deepEqual(searches, ["ABC12", "XYZ99"]);
    assert.equal(first.headers.get("Cache-Control"), "public, max-age=3600");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
