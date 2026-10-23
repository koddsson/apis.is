import { assert, test } from "vitest";
import gengi from "./gengi.ts";

type Rates = Record<string, { rate: number; description?: string }>;

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

test("gengi - fetches and returns all currencies", async () => {
  // Mock fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(mockXmlResponse, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/gengi");
    const res = await gengi(req, {});

    assert.deepEqual(res.status, 200);
    assert.deepEqual(res.headers.get("Access-Control-Allow-Origin"), "*");

    const data = await res.json<Rates>();
    assert.deepEqual(typeof data, "object");
    assert.deepEqual(data.USD.rate, 138.5);
    assert.deepEqual(data.USD.description, "US Dollar");
    assert.deepEqual(data.EUR.rate, 151.2);
    assert.deepEqual(data.GBP.rate, 175.3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gengi - filters by single currency code", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(mockXmlResponse, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/gengi/USD");
    const res = await gengi(req, { code: "USD" });

    const data = await res.json<Rates>();
    assert.deepEqual(Object.keys(data).length, 1);
    assert.deepEqual(data.USD.rate, 138.5);
    assert.deepEqual(data.EUR, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gengi - filters by multiple currency codes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(mockXmlResponse, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/gengi/USD,EUR");
    const res = await gengi(req, { code: "USD,EUR" });

    const data = await res.json<Rates>();
    assert.deepEqual(Object.keys(data).length, 2);
    assert.deepEqual(data.USD.rate, 138.5);
    assert.deepEqual(data.EUR.rate, 151.2);
    assert.deepEqual(data.GBP, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gengi - returns pretty JSON", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(mockXmlResponse, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/gengi");
    const res = await gengi(req, {});

    const text = await res.text();
    assert.include(text, "\n");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gengi - has correct meta information", () => {
  assert.deepEqual(gengi.meta?.endpoint, "/x/gengi/{code}");
  assert.include(gengi.meta?.description || "", "Currency exchange rates");
});

test("gengi - health check requires a positive USD rate", () => {
  const check = gengi.health?.check;
  assert.isDefined(check);
  assert.isUndefined(check?.({ USD: { rate: 124.28 } }));
  assert.include(check?.({ USD: { rate: 0 } }) ?? "", "positive USD rate");
  assert.include(check?.({}) ?? "", "positive USD rate");
});
