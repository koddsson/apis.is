import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import foodInspections from "./food-inspections.ts";

beforeEach(() => {
  clearCache();
});

const TOOLTIP = `<i class="fas fa-info-circle" data-toggle="tooltip" data-html="true" title="<p><b>Matvæli</b> er eftirlit með matvælafyrirtækjum.</p>
<ul class='text-left pl-3'>
  <li>Rekjanleiki matvæla</li>
</ul>
"></i>`;

function review(results: Record<string, string>) {
  const rows = Object.entries(results).map(
    ([label, value]) => `
  <dt>
    ${label}
    ${label === "Heildareinkunn" ? "" : TOOLTIP}
  </dt>
  <dd>
    ${value}
    ${/\d/.test(value) ? '<i class="fas fa-smile text-success"></i>' : ""}
  </dd>`,
  );
  return `<div class="card-footer">
  <dl class="inline-fixed-dl">${rows.join("")}
</dl>
  <a class="card-link show-report-request-form" href="#">
    Senda beiðni um eftirlitsskýrslu
    <i class="fas fa-envelope"></i>
  </a>
</div>`;
}

function card({
  name,
  subtitle,
  rating,
  inspections = [],
}: {
  name: string;
  subtitle: string;
  rating?: string;
  inspections?: Array<[string, Record<string, string>]>;
}) {
  const [latest, ...older] = inspections;
  const footer = latest
    ? `<div class="collapse-container collapse-card">
      <div class="card-footer">
        <a class="collapse-show-button card-link float-right" href="#est_4ce1181b" role="button">Nánar</a>
        <strong>Síðasta eftirlit:</strong> ${latest[0]}
        <a class="card-link super-link" href="/embed/4ce1181b/" target="_blank"></a>
      </div>
      <div class="collapse-last-review collapse" id="est_4ce1181b">
          ${review(latest[1])}
${older
  .map(
    ([day, results]) => `          <div class="collapse-container">
            <div class="card-footer">
              <strong>Eldra eftirlit:</strong> ${day}
            </div>
            <div class="collapse collapse-old-review" id="#est_4ce1181b_7589">
              ${review(results)}
            </div>
          </div>`,
  )
  .join("\n")}
      </div>
    </div>`
    : "";
  return `
<div class="card card-inactive mb-4 ${latest ? "card-has-review" : ""}">
  <div class="card-body">
  <div class="row">
    <div class="col">
      <h5 class="card-title">${name}</h5>
      <h6 class="card-subtitle text-muted">${subtitle}</h6>
    </div>
    <div class="col-4">
      <div class="d-flex h-100">
        <div style="font-size:2.5em" class="justify-content-center align-self-center w-100 text-right">
          ${rating ? `<span>${rating}</span>\n            <i class="fas fa-smile text-success"></i>` : ""}
        </div>
      </div>
    </div>
  </div>
</div>
  ${footer}
</div>`;
}

function page(query: string, total: string, cards: string[], nav = "") {
  return `<!DOCTYPE html>
<html>
<body>
  <div class="container pt-4">
    <form method="get" id="search-form">
      <input id="search-form-input" type="text" name="q" value="${query}" class="form-control form-control-lg">
    </form>
    <h5 class="mb-4">
        Þín leit að „${query}“  fann ${total} niðurstöður <span class="text-muted">af samtals 6.773</span>
    </h5>
    <div class="row">
      <div class="col-xl-9 col-lg-8 col-md-7 col-sm-12 order-md-first">
        <div class="search-results">
          ${cards.join("\n")}
        </div>
${nav}
      </div>
    </div>
  </div>
</body>
</html>`;
}

const DOMINOS = card({
  name: 'Dominos pizza  <small class="text-muted">(480293-2669)</small>',
  subtitle: "Skeifunni 17",
  rating: "4",
  inspections: [
    [
      "20. ágúst 2025",
      {
        Hollustuhættir: "Á ekki við",
        Matvæli: "4",
        Mengunarvarnir: "5",
        Heildareinkunn: "4",
      },
    ],
    [
      "8. apríl 2022",
      {
        Hollustuhættir: "Ekki skoðað",
        Matvæli: "3",
        Mengunarvarnir: "5",
        Heildareinkunn: "3",
      },
    ],
  ],
});

const PIZZA = page("pizza", "3", [
  card({
    name: 'Adam&#39;s pizza &amp; grill  <small class="text-muted">(640610-0690)</small>',
    subtitle: "Seljabraut 54,<br>109 Reykjavík",
  }),
  DOMINOS,
  card({
    name: "Asia Food - Laugavegi 103 ",
    subtitle: "210 Garðabær",
    rating: "0",
    inspections: [
      [
        "3. janúar 2020",
        {
          Hollustuhættir: "0",
          Matvæli: "0",
          Mengunarvarnir: "Á ekki við",
          Heildareinkunn: "0",
        },
      ],
    ],
  }),
]);

const DOMINOS_RESULT = {
  name: "Dominos pizza",
  address: "Skeifunni 17",
  postcode: null,
  town: null,
  rating: 4,
  inspections: [
    {
      date: "2025-08-20",
      rating: 4,
      hygiene: null,
      food: 4,
      pollutionControl: 5,
    },
    {
      date: "2022-04-08",
      rating: 3,
      hygiene: null,
      food: 3,
      pollutionControl: 5,
    },
  ],
};

function mockFetch(body: string, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: Request[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    requested.push(new Request(input, init));
    return Promise.resolve(new Response(body, { status }));
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

function search(query: string | undefined, search = "") {
  return foodInspections(
    new Request(
      `http://localhost/x/food-inspections${query === undefined ? "" : `/${query}`}${search}`,
    ),
    query === undefined ? {} : { query },
  );
}

test("food-inspections - parses businesses and their inspection history", async () => {
  const server = mockFetch(PIZZA);
  try {
    const res = await search("pizza");
    const data = await res.json();
    assert.isUndefined(validate(foodInspections.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
    const url = new URL(server.requested[0].url);
    assert.equal(url.origin, "https://her.reykjavik.is");
    assert.equal(url.searchParams.get("q"), "pizza");
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(
      server.requested[0].headers.get("User-Agent"),
      "apis.is (+https://apis.is)",
    );
    assert.deepEqual(data, {
      query: "pizza",
      total: 3,
      page: 1,
      pageCount: 1,
      results: [
        {
          name: "Adam's pizza & grill",
          address: "Seljabraut 54",
          postcode: "109",
          town: "Reykjavík",
          rating: null,
          inspections: [],
        },
        DOMINOS_RESULT,
        {
          name: "Asia Food - Laugavegi 103",
          address: null,
          postcode: "210",
          town: "Garðabær",
          rating: 0,
          inspections: [
            {
              date: "2020-01-03",
              rating: 0,
              hygiene: 0,
              food: 0,
              pollutionControl: null,
            },
          ],
        },
      ],
    });
  } finally {
    server.restore();
  }
});

test("food-inspections - pages through results and decodes the query", async () => {
  const cards = Array.from({ length: 2 }, () => DOMINOS);
  const server = mockFetch(
    page("Dominos pizza", "1.002", cards, '<nav class="pagination"></nav>'),
  );
  try {
    const res = await search("Dominos%20pizza", "?page=6&pretty=true");
    const text = await res.text();
    assert.include(text, "\n");
    const data = JSON.parse(text);
    assert.deepEqual(
      { ...data, results: data.results.length },
      {
        query: "Dominos pizza",
        total: 1002,
        page: 6,
        pageCount: 6,
        results: 2,
      },
    );
    const url = new URL(server.requested[0].url);
    assert.equal(url.searchParams.get("q"), "Dominos pizza");
    assert.equal(url.searchParams.get("page"), "6");
  } finally {
    server.restore();
  }
});

test("food-inspections - returns an empty list when nothing matches", async () => {
  const server = mockFetch(page("zzqqxx", "0", []));
  try {
    const data = await (await search("zzqqxx")).json();
    assert.deepEqual(data, {
      query: "zzqqxx",
      total: 0,
      page: 1,
      pageCount: 0,
      results: [],
    });
  } finally {
    server.restore();
  }
});

test("food-inspections - 404s pages past the last one", async () => {
  const server = mockFetch("<h1>Not Found</h1>", 404);
  try {
    const res = await search("pizza", "?page=7");
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'No page 7 for "pizza"' });
  } finally {
    server.restore();
  }
});

test("food-inspections - rejects missing searches and invalid pages", async () => {
  const server = mockFetch(PIZZA);
  try {
    for (const [query, params] of [
      [undefined, ""],
      ["%20", ""],
      ["%E0%A4%A", ""],
      ["pizza", "?page=0"],
      ["pizza", "?page=x"],
    ] as const) {
      const res = await search(query, params);
      assert.equal(res.status, 400, `${query}${params}`);
    }
    assert.equal(server.requested.length, 0);
  } finally {
    server.restore();
  }
});

test("food-inspections - throws when the upstream responds with an error", async () => {
  for (const [status, params] of [
    [503, ""],
    [404, ""],
  ] as const) {
    clearCache();
    const server = mockFetch("unavailable", status);
    try {
      await search("pizza", params).then(
        () => assert.fail("expected an error"),
        (error: Error) => assert.include(error.message, String(status)),
      );
    } finally {
      server.restore();
    }
  }
});

test("food-inspections - throws when the page format changes", async () => {
  const unknown = (label: string, value: string, day = "1. mars 2024") =>
    page("pizza", "1", [
      card({
        name: "Pizza",
        subtitle: "",
        rating: "5",
        inspections: [[day, { [label]: value }]],
      }),
    ]);
  const cases: Array<[string, string]> = [
    ["<html></html>", "result count not found"],
    [page("pizza", "2", [DOMINOS]), "Expected 2 food inspection results"],
    [
      page("pizza", "1", ['<div class="card card-inactive mb-4"></div>']),
      "Unexpected food inspection card",
    ],
    [
      page("pizza", "1", [
        DOMINOS.replace('<dl class="inline-fixed-dl">', "<dl>").replace(
          "</dl>",
          "</dl><dl></dl>",
        ),
      ]),
      "don't line up",
    ],
    [
      unknown("Heildareinkunn", "Lokað"),
      'Unknown food inspection rating "Lokað"',
    ],
    [unknown("Hávaði", "5"), 'Unknown food inspection category "Hávaði"'],
    [
      unknown("Matvæli", "5", "1. smarch 2024"),
      'Unknown food inspection date "1. smarch 2024"',
    ],
    [
      unknown("Matvæli", "5", "2024-03-01"),
      'Unknown food inspection date "2024-03-01"',
    ],
  ];
  for (const [html, message] of cases) {
    clearCache();
    const server = mockFetch(html);
    try {
      await search("pizza").then(
        () => assert.fail(`expected an error for ${message}`),
        (error: Error) => assert.include(error.message, message),
      );
    } finally {
      server.restore();
    }
  }
});
