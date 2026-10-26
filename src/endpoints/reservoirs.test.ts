import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import reservoirs from "./reservoirs.ts";

beforeEach(() => {
  clearCache();
});

const OCT_1 = 1790812800000;
const OCT_2 = 1790899200000;
const OCT_3 = 1790985600000;

function page(id: string, title: string, series: unknown[]) {
  const data = JSON.stringify({
    title,
    id,
    series,
    yAxis: { title: "m.y.s." },
  });
  const next = {
    props: {
      pageProps: {
        page: {
          body: [
            {
              __typename: "PageBodyGraph",
              type: "graph",
              primary: { data_id: id, type: "waterLevel", options: null, data },
            },
            { __typename: "PageBodyPaging" },
          ],
        },
      },
    },
  };
  return `<!DOCTYPE html><html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></body></html>`;
}

function waterYear(id: string, title: string, overflow: number) {
  return page(id, title, [
    {
      name: "Lægsta gildi, hæsta gildi",
      type: "arearange",
      uom: "m.y.s.",
      data: [
        [OCT_1, 623.09, 626.57],
        [OCT_2, 623.31, 626.55],
        [OCT_3, 623.46, 626.45],
      ],
    },
    {
      name: "Áætlað meðaltal",
      type: "line",
      uom: "m.y.s.",
      data: [
        [OCT_1, 624.92],
        [OCT_2, 624.9],
        [OCT_3, 624.87],
      ],
    },
    {
      name: "Síðasta vatnsár",
      type: "line",
      uom: "m.y.s.",
      data: [
        [OCT_1, 625.69],
        [OCT_2, 625.66],
        [OCT_3, 625.62],
      ],
    },
    {
      name: "Núverandi vatnsár",
      type: "line",
      uom: "m.y.s.",
      data: [
        [OCT_1, 623.56],
        [OCT_2, 623.61],
        [OCT_3, null],
      ],
    },
    {
      name: "Yfirfall",
      type: "line",
      uom: "m.y.s.",
      data: [
        [OCT_1, overflow],
        [OCT_2, overflow],
        [OCT_3, overflow],
      ],
    },
  ]);
}

const PAGES: Record<string, string> = {
  "vatnshaed-halslons": waterYear("halslon", "Hálslón", 625),
  "vatnshaed-thorisvatns": waterYear("thorisvatn", "Þórisvatn", 579),
  "vatnshaed-blondulons": waterYear("blondulon", "Blöndulón", 478),
  "vatnshaed-thingvallavatns": page("thingvallavatn", "Þingvallavatn", [
    {
      name: "Vatnshæð",
      type: "line",
      uom: "m.y.s.",
      data: [
        [OCT_2, 102.44],
        [OCT_3, 102.52],
      ],
    },
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

test("reservoirs - combines the reservoir pages", async () => {
  const server = mockFetch(PAGES);
  try {
    const res = await reservoirs(new Request("http://localhost/x/reservoirs"));
    const data = await res.json<unknown[]>();
    assert.isUndefined(validate(reservoirs.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
    assert.equal(server.requested.length, 4);
    assert.equal(server.requested[0].userAgent, "apis.is (+https://apis.is)");

    assert.deepEqual(data[0], {
      id: "halslon",
      name: "Hálslón",
      url: "https://www.landsvirkjun.is/rauntimavoktun/vatnshaed-halslons",
      overflowLevel: 625,
      latest: {
        date: "2026-10-02",
        level: 623.61,
        expectedMean: 624.9,
        minimum: 623.31,
        maximum: 626.55,
        lastYear: 625.66,
      },
      series: [
        {
          date: "2026-10-01",
          level: 623.56,
          expectedMean: 624.92,
          minimum: 623.09,
          maximum: 626.57,
          lastYear: 625.69,
        },
        {
          date: "2026-10-02",
          level: 623.61,
          expectedMean: 624.9,
          minimum: 623.31,
          maximum: 626.55,
          lastYear: 625.66,
        },
      ],
    });
    assert.deepEqual(data[3], {
      id: "thingvallavatn",
      name: "Þingvallavatn",
      url: "https://www.landsvirkjun.is/rauntimavoktun/vatnshaed-thingvallavatns",
      overflowLevel: null,
      latest: {
        date: "2026-10-03",
        level: 102.52,
        expectedMean: null,
        minimum: null,
        maximum: null,
        lastYear: null,
      },
      series: [
        {
          date: "2026-10-02",
          level: 102.44,
          expectedMean: null,
          minimum: null,
          maximum: null,
          lastYear: null,
        },
        {
          date: "2026-10-03",
          level: 102.52,
          expectedMean: null,
          minimum: null,
          maximum: null,
          lastYear: null,
        },
      ],
    });
  } finally {
    server.restore();
  }
});

test("reservoirs - filters by reservoir and 404s unknown ones", async () => {
  const server = mockFetch(PAGES);
  try {
    const one = await reservoirs(
      new Request(
        "http://localhost/x/reservoirs?reservoir=blondulon&pretty=true",
      ),
    );
    const text = await one.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((r: { name: string }) => r.name),
      ["Blöndulón"],
    );

    const unknown = await reservoirs(
      new Request("http://localhost/x/reservoirs?reservoir=lagarfljot"),
    );
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), {
      error: "Unknown reservoir lagarfljot",
    });
    assert.equal(server.requested.length, 4);
  } finally {
    server.restore();
  }
});

async function expectError(pages: Record<string, string>, message: string) {
  clearCache();
  const server = mockFetch(pages);
  try {
    await reservoirs(new Request("http://localhost/x/reservoirs")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, message),
    );
  } finally {
    server.restore();
  }
}

test("reservoirs - throws when Landsvirkjun responds with an error", async () => {
  const server = mockFetch(PAGES, 503);
  try {
    await reservoirs(new Request("http://localhost/x/reservoirs")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});

test("reservoirs - throws when the page format changes", async () => {
  await expectError(
    { ...PAGES, "vatnshaed-halslons": "<html></html>" },
    "Page data not found on vatnshaed-halslons",
  );

  const noGraph = { props: { pageProps: { page: { body: [] } } } };
  await expectError(
    {
      ...PAGES,
      "vatnshaed-halslons": `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(noGraph)}</script>`,
    },
    "Graph not found on vatnshaed-halslons",
  );

  await expectError(
    { ...PAGES, "vatnshaed-halslons": page("halslon", "Hálslón", []) },
    "Unexpected graph data on vatnshaed-halslons",
  );

  await expectError(
    {
      ...PAGES,
      "vatnshaed-halslons": PAGES["vatnshaed-thorisvatns"],
    },
    "Unexpected graph data on vatnshaed-halslons",
  );

  await expectError(
    {
      ...PAGES,
      "vatnshaed-thingvallavatns": page("thingvallavatn", "Þingvallavatn", [
        { name: "Vatnshæð", type: "line", data: [[OCT_1, null]] },
      ]),
    },
    "No water level readings on vatnshaed-thingvallavatns",
  );
});
