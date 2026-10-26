import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import rivers from "./rivers.ts";

beforeEach(() => {
  clearCache();
});

const SEP_30 = 1790726400000;
const OCT_1 = 1790812800000;
const OCT_23 = 1792713600000;
const OCT_24 = 1792800000000;
const OCT_25 = 1792886400000;
const OCT_26 = 1792972800000;
const OCT_27 = 1793059200000;

function page(id: string, title: string, series: unknown[]) {
  const data = JSON.stringify({
    title,
    id,
    series,
    yAxis: { title: "m3/s" },
  });
  const next = {
    props: {
      pageProps: {
        page: {
          body: [
            {
              __typename: "PageBodyGraph",
              type: "graph",
              primary: { data_id: id, type: "waterFlow", options: null, data },
            },
            { __typename: "PageBodyPaging" },
          ],
        },
      },
    },
  };
  return `<!DOCTYPE html><html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></body></html>`;
}

function line(name: string, data: unknown[]) {
  return { name, type: "line", uom: "m3/s", data };
}

function overflow(id: string, title: string, current: unknown[]) {
  return page(id, title, [
    line("Rennsli um yfirfall 2026", current),
    line("Rennsli um yfirfall 2025", [
      [OCT_24, 0],
      [OCT_25, 0],
      [OCT_26, 0],
    ]),
    line("Rennsli um yfirfall 2024", [
      [OCT_24, 0],
      [OCT_25, 0],
      [OCT_26, 0],
    ]),
  ]);
}

const THJORSA = page("thjorsa-nedri", "Þjórsá neðan Búrfells", [
  line("Mælt rennsli", [
    [OCT_23, 308.54],
    [OCT_24, 345.01],
    [OCT_25, 312.24],
  ]),
  line("Spá um rennsli", [
    [OCT_26, 357],
    [OCT_27, 358],
  ]),
]);

const PAGES: Record<string, string> = {
  "rennsli-thjorsar-nedan-burfells": THJORSA,
  "blanda-rennsli-nedan-virkjunar": page(
    "langamyri",
    "Langamýri neðan virkjunar",
    [
      line("Rennsli neðan virkjunar (Við Löngumýri)", [
        [OCT_24, 56.35],
        [OCT_25, 48.37],
      ]),
    ],
  ),
  "rennsli-um-yfirfall-halslons": overflow("halslon", "Hálslón", [
    [OCT_24, 8.14],
    [OCT_25, 2.4],
  ]),
  "rennsli-um-yfirfall-blondulons": overflow("blondulon", "Blöndulón", [
    [OCT_24, 0],
    [OCT_25, 0],
  ]),
  "sumarrennsli-jokulsar-i-fljotsdal": page("jokulsa", "Jökulsá í Fljótsdal", [
    {
      name: "Lægsta gildi, hæsta gildi",
      type: "arearange",
      uom: "m3/s",
      data: [
        [SEP_30, 2.2, 134],
        [OCT_1, 2.3, 128],
      ],
    },
    line("Rennsli við Hól", [
      [SEP_30, 125.93],
      [OCT_1, 237.38],
    ]),
    line("Rennsli við Hrakstrandarfoss", [
      [SEP_30, 117.02],
      [OCT_1, 239.84],
    ]),
    line("Meðalrennsli", [
      [SEP_30, 30.1],
      [OCT_1, 29.5],
    ]),
  ]),
};

function mockFetch(pages: Record<string, string>, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: Array<{ url: string; userAgent: string | null }> = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    requested.push({
      url,
      userAgent: new Headers(init?.headers).get("User-Agent"),
    });
    const slug = url.split("/").at(-1) as string;
    return Promise.resolve(new Response(pages[slug] ?? "", { status }));
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

async function get(query = "") {
  const res = await rivers(new Request(`http://localhost/x/rivers${query}`));
  return { res, data: await res.json<Array<Record<string, unknown>>>() };
}

test("rivers - combines the river flow pages", async () => {
  const server = mockFetch(PAGES);
  try {
    const { res, data } = await get();
    assert.isUndefined(validate(rivers.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
    assert.equal(server.requested.length, 5);
    assert.equal(server.requested[0].userAgent, "apis.is (+https://apis.is)");

    assert.deepEqual(
      data.map((river) => river.id),
      [
        "thjorsa-burfell",
        "blanda-langamyri",
        "halslon-overflow",
        "blondulon-overflow",
        "jokulsa-holl",
        "jokulsa-hrakstrandarfoss",
      ],
    );
    assert.deepEqual(data[0], {
      id: "thjorsa-burfell",
      name: "Þjórsá neðan Búrfells",
      url: "https://www.landsvirkjun.is/rauntimavoktun/rennsli-thjorsar-nedan-burfells",
      unit: "m3/s",
      latest: { date: "2026-10-25", flow: 312.24 },
      measured: [
        { date: "2026-10-23", flow: 308.54 },
        { date: "2026-10-24", flow: 345.01 },
        { date: "2026-10-25", flow: 312.24 },
      ],
      forecast: [
        { date: "2026-10-26", flow: 357 },
        { date: "2026-10-27", flow: 358 },
      ],
    });
    assert.deepEqual(data[2], {
      id: "halslon-overflow",
      name: "Yfirfall Hálslóns",
      url: "https://www.landsvirkjun.is/rauntimavoktun/rennsli-um-yfirfall-halslons",
      unit: "m3/s",
      latest: { date: "2026-10-25", flow: 2.4 },
      measured: [
        { date: "2026-10-24", flow: 8.14 },
        { date: "2026-10-25", flow: 2.4 },
      ],
      forecast: [],
    });
    assert.deepEqual(data[5], {
      id: "jokulsa-hrakstrandarfoss",
      name: "Jökulsá í Fljótsdal við Hrakstrandarfoss",
      url: "https://www.landsvirkjun.is/rauntimavoktun/sumarrennsli-jokulsar-i-fljotsdal",
      unit: "m3/s",
      latest: { date: "2026-10-01", flow: 239.84 },
      measured: [
        { date: "2026-09-30", flow: 117.02 },
        { date: "2026-10-01", flow: 239.84 },
      ],
      forecast: [],
    });
  } finally {
    server.restore();
  }
});

test("rivers - dates overflow by the year in the series name", async () => {
  const server = mockFetch({
    ...PAGES,
    "rennsli-um-yfirfall-halslons": page("halslon", "Hálslón", [
      line("Rennsli um yfirfall 2024", [[OCT_24, 1]]),
      line("Rennsli um yfirfall 2025", [
        [OCT_24, 3.5],
        [OCT_25, null],
      ]),
      line("Rennsli um yfirfall 2023", [[OCT_24, 2]]),
    ]),
  });
  try {
    const { data } = await get("?river=halslon-overflow");
    assert.deepEqual(data[0].measured, [{ date: "2025-10-24", flow: 3.5 }]);
  } finally {
    server.restore();
  }
});

test("rivers - allows empty seasonal series", async () => {
  const server = mockFetch({
    ...PAGES,
    "rennsli-um-yfirfall-blondulons": overflow("blondulon", "Blöndulón", []),
  });
  try {
    const { data } = await get();
    assert.isUndefined(validate(rivers.health.schema, data));
    assert.equal(data[3].latest, null);
    assert.deepEqual(data[3].measured, []);
  } finally {
    server.restore();
  }
});

test("rivers - filters by river and 404s unknown ones", async () => {
  const server = mockFetch(PAGES);
  try {
    const one = await rivers(
      new Request("http://localhost/x/rivers?river=jokulsa-holl&pretty=true"),
    );
    const text = await one.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((r: { name: string }) => r.name),
      ["Jökulsá í Fljótsdal við Hól"],
    );

    const unknown = await rivers(
      new Request("http://localhost/x/rivers?river=lagarfljot"),
    );
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), {
      error: "Unknown river lagarfljot",
    });
    assert.equal(server.requested.length, 5);
  } finally {
    server.restore();
  }
});

async function expectError(pages: Record<string, string>, message: string) {
  clearCache();
  const server = mockFetch(pages);
  try {
    await rivers(new Request("http://localhost/x/rivers")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, message),
    );
  } finally {
    server.restore();
  }
}

test("rivers - throws when Landsvirkjun responds with an error", async () => {
  await expectError({}, "Page data not found");
  const server = mockFetch(PAGES, 500);
  try {
    await rivers(new Request("http://localhost/x/rivers")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "500"),
    );
  } finally {
    server.restore();
  }
});

test("rivers - throws when the page format changes", async () => {
  const slug = "rennsli-thjorsar-nedan-burfells";
  const unexpected = `Unexpected graph data on ${slug}`;

  await expectError(
    { ...PAGES, [slug]: PAGES["blanda-rennsli-nedan-virkjunar"] },
    unexpected,
  );
  await expectError(
    {
      ...PAGES,
      [slug]: page("thjorsa-nedri", "Þjórsá", [line("Rennsli", [])]),
    },
    unexpected,
  );
  await expectError(
    {
      ...PAGES,
      [slug]: page("thjorsa-nedri", "Þjórsá", [
        line("Mælt rennsli", [[OCT_25, 312.24]]),
      ]),
    },
    unexpected,
  );
  await expectError(
    {
      ...PAGES,
      [slug]: page("thjorsa-nedri", "Þjórsá", [
        { name: "Mælt rennsli", type: "line", data: [[OCT_25, 312.24]] },
        line("Spá um rennsli", []),
      ]),
    },
    unexpected,
  );
  await expectError(
    {
      ...PAGES,
      "rennsli-um-yfirfall-halslons": page("halslon", "Hálslón", [
        line("Rennsli um yfirfall", [[OCT_25, 1]]),
      ]),
    },
    "Unexpected graph data on rennsli-um-yfirfall-halslons",
  );
  await expectError(
    {
      ...PAGES,
      [slug]: page("thjorsa-nedri", "Þjórsá", [
        line("Mælt rennsli", [[OCT_25, null]]),
        line("Spá um rennsli", [[OCT_26, 357]]),
      ]),
    },
    `No flow readings on ${slug}`,
  );
});
