import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import gengi from "./gengi.ts";

// Mock XML response from Borgun API
const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Rates>
  <Rate>
    <CurrencyCode>USD</CurrencyCode>
    <CurrencyDescription>Dollar, US</CurrencyDescription>
    <CurrencyRate>138.50</CurrencyRate>
  </Rate>
  <Rate>
    <CurrencyCode>EUR</CurrencyCode>
    <CurrencyDescription>Euro, EU</CurrencyDescription>
    <CurrencyRate>151.20</CurrencyRate>
  </Rate>
  <Rate>
    <CurrencyCode>GBP</CurrencyCode>
    <CurrencyDescription>Pound, Great Britain</CurrencyDescription>
    <CurrencyRate>175.30</CurrencyRate>
  </Rate>
</Rates>`;

Deno.test("gengi - fetches and returns all currencies", async () => {
  // Mock fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(mockXmlResponse, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/gengi");
    const res = await gengi(req, {});

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");

    const data = await res.json();
    assertEquals(typeof data, "object");
    assertEquals(data.USD.rate, 138.50);
    assertEquals(data.USD.description, "US Dollar");
    assertEquals(data.EUR.rate, 151.20);
    assertEquals(data.GBP.rate, 175.30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("gengi - filters by single currency code", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(mockXmlResponse, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/gengi/USD");
    const res = await gengi(req, { code: "USD" });

    const data = await res.json();
    assertEquals(Object.keys(data).length, 1);
    assertEquals(data.USD.rate, 138.50);
    assertEquals(data.EUR, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("gengi - filters by multiple currency codes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(mockXmlResponse, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/gengi/USD,EUR");
    const res = await gengi(req, { code: "USD,EUR" });

    const data = await res.json();
    assertEquals(Object.keys(data).length, 2);
    assertEquals(data.USD.rate, 138.50);
    assertEquals(data.EUR.rate, 151.20);
    assertEquals(data.GBP, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("gengi - returns pretty JSON", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(mockXmlResponse, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/gengi");
    const res = await gengi(req, {});

    const text = await res.text();
    assertStringIncludes(text, "\n");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("gengi - has correct meta information", () => {
  assertEquals(gengi.meta?.endpoint, "/x/gengi/{code}");
  assertStringIncludes(
    gengi.meta?.description || "",
    "Currency exchange rates",
  );
});
