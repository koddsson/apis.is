import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import car from "./car.ts";

const mockCarResponse = {
  data: {
    getPublicVehicleSearch: {
      permno: "ABC12",
      make: "Toyota",
      model: "Corolla",
      year: 2020,
      color: "Blue",
    },
  },
};

Deno.test("car - fetches and returns vehicle data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(JSON.stringify(mockCarResponse), { status: 200 }),
    );
  };

  try {
    const req = new Request("http://localhost/x/car/ABC12");
    const res = await car(req, { number: "ABC12" });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");

    const data = await res.json();
    assertEquals(typeof data, "object");
    assertEquals(data.permno, "ABC12");
    assertEquals(data.make, "Toyota");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("car - includes number parameter in API call", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = (url: string | URL | Request) => {
    requestedUrl = url.toString();
    return Promise.resolve(
      new Response(JSON.stringify(mockCarResponse), { status: 200 }),
    );
  };

  try {
    const req = new Request("http://localhost/x/car/XYZ99");
    await car(req, { number: "XYZ99" });

    assertStringIncludes(requestedUrl, "XYZ99");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("car - returns compact JSON by default", async () => {
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
    assertEquals(text.includes("\n"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("car - returns pretty JSON when pretty=true", async () => {
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
    assertEquals(text.includes("\n"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("car - has correct meta information", () => {
  assertEquals(car.meta?.endpoint, "/x/car/{number}");
  assertStringIncludes(car.meta?.description || "", "Vehicle information");
});
