import { assert, beforeEach, test, vi } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import outages, { parseNordurorka, parseRarik } from "./outages.ts";

beforeEach(() => {
  clearCache();
});

function veiturOutage(
  uid: string,
  overrides: Record<string, unknown>,
  status?: string,
) {
  return {
    system: { uid, created_at: "2026-10-20T15:45:29.415Z" },
    heading: "Kaldavatnslaust við Gautland 5-21 og Efstaland 26",
    short_description: "Kaldavatnslaust er vegna viðgerðar.",
    classification: "Kalt vatn",
    type: "Bilanir og viðgerðir",
    zip: "108",
    implementation_date_from: "2026-10-26T14:00:00.000Z",
    implementation_date_to: "2026-10-26T17:00:00.000Z",
    url: `/bilanir/${uid}`,
    outages_statusConnection: {
      edges: status
        ? [{ node: { title: status, label: status, status: "x" } }]
        : [],
    },
    ...overrides,
  };
}

const VEITUR_HITS = [
  veiturOutage("blt37066decad285636", {}, "Vinna ekki hafin"),
  veiturOutage(
    "blt1",
    {
      heading: "Rafmagnslaust  í Hlíðum ",
      classification: "Rafmagn",
      zip: "105",
      implementation_date_from: "2026-10-22T09:00:00.000Z",
      implementation_date_to: "2026-10-22T12:00:00.000Z",
    },
    "Vinnu lokið",
  ),
  veiturOutage("blt2", {
    heading: "Ný veitutegund",
    classification: "Annað",
    implementation_date_from: "2026-10-20T09:00:00.000Z",
    implementation_date_to: "2026-10-20T10:00:00.000Z",
  }),
];

function veiturPage(hits: unknown[]) {
  const data = { props: { pageProps: { content: { hits, total: 3765 } } } };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

function rarikRow(id: string | null, fields: Record<string, string>) {
  const parts = Object.entries(fields).map(
    ([name, html]) =>
      `<div class="rarOAlertsListing-${name} aos-MTXS">${html}</div>`,
  );
  const map = id
    ? `<div class="rarOAlertsListing-map aos-MTXS"><a href="https://s-rek-arcgis-y1.rarik.is/tilkynning/?ANNOUNCEMENT_ID=${id}" target="_blank">Skoða á korti</a></div>`
    : "";
  return `<div class="rarOAlertsListing-listingrow ao-W100"><div class="rarOAlertsListing-details aos-FL">${parts.join("")}${map}</div></div>`;
}

const DIVIDER =
  '<hr class="ao-CrIb ao-DS27-HDivider rarOAlertsListing-divider aos-MTBM">';

const RARIK_CONTENT = [
  rarikRow("6222", {
    title:
      '<h3 class="aos-DS27-H3">Rafmagnsbilun Hamarsfirði og Álftafirði 26.10.2026</h3>',
    date: "Skráð á vef: 26.10.2026 11:50",
    message:
      "Rafmagnslaust er í Hamarsfirði og Álftafirði um kl. 11:37 þann 26.10.2026. Bilanaleit stendur yfir.",
    timespan: "<b>Tímasetning atburðar:</b> 26.10.2026 11:37 til 18:00",
    status: "<b>Staða:</b> Í gangi",
  }).replace(
    "</div></div>",
    '</div><div class="rarOAlertsListing-childrenWrap aos-DN"><div class="rarOAlertsListing-title"><h3>Stutt rafmagnsleysi</h3></div><div class="rarOAlertsListing-timespan">26.10.2026 11:10 til 11:20</div></div></div>',
  ),
  rarikRow("6213", {
    title: "<h3>Rafmagnsleysi við Svínavatn og Laxárvatn. 28.10.2026</h3>",
    message: "Vegna vinnu verður rafmagnslaust &amp; kalt&nbsp;inni.",
    timespan:
      "<b>Tímasetning atburðar:</b> 28.10.2026 23:30 til 29.10.2026 05:00",
    status: "<b>Staða:</b> Ekki hafið",
  }),
  rarikRow("6197", {
    title: "<h3>Heitavatnslaust Búðardal-Lokið 22.10.2026</h3>",
    message: "Heitavatnslaust var í Búðardal.",
    timespan: "<b>Tímasetning atburðar:</b> 22.10.2026 13:30 til 14:30",
    status: "<b>Staða:</b> Lokið",
  }),
  rarikRow("6100", {
    title: "<h3>Kaldavatnslaust á Hvolsvelli</h3>",
    timespan: "<b>Tímasetning atburðar:</b> 21.10.2026 10:00 til 11:00",
  }),
].join(DIVIDER);

function nordurorkaItem(
  id: string,
  title: string,
  when: string,
  where?: string,
  description = "Vegna vinnu við dreifikerfi verður lokað fyrir kalt vatn.&nbsp;",
) {
  return `<div class="item ${id} hasImage">
    <div class="content">
		<h2>${title}</h2>
		<div class="description">
				<p>${description}</p>								<div class="interuption__button">
                    <p><a class="btn btn-primary" href="https://www.no.is/is/thjonusta/god-rad-komi-til-thjonusturofs">Góð ráð við þjónusturofi</a></p>
				</div>
				            </div>
        <div class="details">
${where ? `				<div class="where">${where}</div>\n` : ""}				<div class="when">${when}</div>
		</div>
    </div>
	</div>`;
}

function nordurorkaPage(items: string[]) {
  return `<div id="extras" class="box"><div class="boxTitle"><h1>Tilkynningar um þjónusturof</h1></div><div class="boxText"><div class="items">${items.join("\n")}</div></div></div>`;
}

const NORDURORKA_PAGE = nordurorkaPage([
  nordurorkaItem(
    "kaldavatnslokun",
    "Kaldavatnslokun",
    "Fimmtudaginn 29.10.2026 milli 08:00-12:00",
    "Sundlaug Akureyrar og hótel Berjaya",
  ),
]);

function mockFetch(responses: {
  veitur?: Response;
  rarik?: Response;
  nordurorka?: Response;
}) {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  const userAgents: Array<string | null> = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    requested.push(url);
    userAgents.push(new Headers(init?.headers).get("User-Agent"));
    if (url.startsWith("https://www.no.is/")) {
      return Promise.resolve(
        responses.nordurorka ?? new Response(NORDURORKA_PAGE),
      );
    }
    if (url.startsWith("https://www.veitur.is/")) {
      return Promise.resolve(
        responses.veitur ?? new Response(veiturPage(VEITUR_HITS)),
      );
    }
    return Promise.resolve(
      responses.rarik ??
        new Response(
          JSON.stringify({
            MORE: true,
            LAST: 20,
            TOTAL: 120,
            CONTENT: RARIK_CONTENT,
          }),
        ),
    );
  };
  return {
    requested,
    userAgents,
    restore: () => (globalThis.fetch = originalFetch),
  };
}

function get(query = "") {
  return outages(new Request(`http://localhost/x/outages${query}`));
}

test("outages - combines Veitur, RARIK and Norðurorka, newest first", async () => {
  const server = mockFetch({});
  try {
    const res = await get();
    const data = await res.json<Array<Record<string, unknown>>>();
    assert.isUndefined(validate(outages.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
    assert.deepEqual(server.requested.length, 3);
    assert.include(server.userAgents, "apis.is (+https://apis.is)");

    assert.deepEqual(
      data.map((outage) => `${outage.source} ${outage.id}`),
      [
        "Norðurorka kaldavatnslokun",
        "RARIK 6213",
        "Veitur blt37066decad285636",
        "RARIK 6222",
        "RARIK 6197",
        "Veitur blt1",
        "RARIK 6100",
        "Veitur blt2",
      ],
    );
    assert.deepEqual(data[2], {
      source: "Veitur",
      id: "blt37066decad285636",
      type: "cold-water",
      status: "not-started",
      title: "Kaldavatnslaust við Gautland 5-21 og Efstaland 26",
      description: "Kaldavatnslaust er vegna viðgerðar.",
      postcode: "108",
      location: null,
      start: "2026-10-26T14:00:00.000Z",
      end: "2026-10-26T17:00:00.000Z",
      url: "https://www.veitur.is/bilanir/blt37066decad285636",
    });
    assert.deepEqual(data[3], {
      source: "RARIK",
      id: "6222",
      type: "power",
      status: "in-progress",
      title: "Rafmagnsbilun Hamarsfirði og Álftafirði 26.10.2026",
      description:
        "Rafmagnslaust er í Hamarsfirði og Álftafirði um kl. 11:37 þann 26.10.2026. Bilanaleit stendur yfir.",
      postcode: null,
      location: null,
      start: "2026-10-26T11:37:00.000Z",
      end: "2026-10-26T18:00:00.000Z",
      url: "https://s-rek-arcgis-y1.rarik.is/tilkynning/?ANNOUNCEMENT_ID=6222",
    });

    const byId = Object.fromEntries(data.map((outage) => [outage.id, outage]));
    assert.include(byId["6213"], {
      status: "not-started",
      description: "Vegna vinnu verður rafmagnslaust & kalt inni.",
      start: "2026-10-28T23:30:00.000Z",
      end: "2026-10-29T05:00:00.000Z",
    });
    assert.include(byId["6197"], { type: "hot-water", status: "finished" });
    assert.include(byId["6100"], {
      type: "cold-water",
      status: null,
      description: "",
    });
    assert.include(byId.blt1, {
      type: "power",
      status: "finished",
      title: "Rafmagnslaust í Hlíðum",
    });
    assert.include(byId.blt2, { type: null, status: null });
  } finally {
    server.restore();
  }
});

test("outages - filters by type and status", async () => {
  const server = mockFetch({});
  try {
    const ids = async (query: string) =>
      (await (await get(query)).json<Array<{ id: string }>>()).map(
        (outage) => outage.id,
      );
    assert.deepEqual(await ids("?type=hot-water"), ["6197"]);
    assert.deepEqual(await ids("?status=finished"), ["6197", "blt1"]);
    assert.deepEqual(await ids("?type=power&status=in-progress&pretty=true"), [
      "6222",
    ]);
    assert.deepEqual(server.requested.length, 3);
  } finally {
    server.restore();
  }
});

test("outages - rejects unknown filters", async () => {
  for (const query of ["?type=gas", "?status=done"]) {
    const res = await get(query);
    assert.equal(res.status, 400, query);
  }
});

test("outages - allows RARIK to have no alerts", async () => {
  const server = mockFetch({
    rarik: new Response(JSON.stringify({ TOTAL: 0, CONTENT: "" })),
  });
  try {
    const data = await (await get()).json<Array<{ source: string }>>();
    assert.deepEqual(
      [...new Set(data.map((outage) => outage.source))],
      ["Norðurorka", "Veitur"],
    );
  } finally {
    server.restore();
  }
});

test("outages - throws when a source fails or changes", async () => {
  const cases: Array<[Parameters<typeof mockFetch>[0], string]> = [
    [{ veitur: new Response("", { status: 503 }) }, "Veitur outages: 503"],
    [{ veitur: new Response("<html></html>") }, "Veitur outage data not found"],
    [{ rarik: new Response("", { status: 502 }) }, "RARIK outages: 502"],
    [
      { rarik: new Response(JSON.stringify({ TOTAL: 5, CONTENT: "<p></p>" })) },
      "RARIK outages not found",
    ],
    [
      { nordurorka: new Response("", { status: 500 }) },
      "Norðurorka outages: 500",
    ],
    [
      { nordurorka: new Response("<html></html>") },
      "Norðurorka outage list not found",
    ],
  ];
  for (const [responses, message] of cases) {
    clearCache();
    const server = mockFetch(responses);
    try {
      await get().then(
        () => assert.fail("expected an error"),
        (error: Error) => assert.include(error.message, message),
      );
    } finally {
      server.restore();
    }
  }
});

test("parseRarik - rejects alerts without an id or time span", () => {
  const timespan = "26.10.2026 11:37 til 18:00";
  for (const row of [
    rarikRow(null, { title: "<h3>No id</h3>", timespan }),
    rarikRow("1", { title: "<h3>No time</h3>", timespan: "óákveðið" }),
  ]) {
    assert.throws(() => parseRarik(row), "Unexpected RARIK alert");
  }
});

test("parseNordurorka - reads times, places and types from the notices", () => {
  vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
  try {
    const parsed = parseNordurorka(
      nordurorkaPage([
        nordurorkaItem(
          "kaldavatnslokun",
          "Kaldavatnslokun",
          "Fimmtudaginn 29.10.2026 milli 08:00-12:00",
          "Sundlaug Akureyrar og hótel Berjaya",
        ),
        nordurorkaItem(
          "straumrof",
          "Straumrof",
          "Laugardaginn 5. september milli kl. 7:00 og 10:45, eða á meðan vinnu stendur.",
          "Hafnarstræti",
          "Straumlaust verður vegna vinnu.",
        ),
        nordurorkaItem(
          "gilsbakkavegur-hitaveiturof-27102026",
          "Gilsbakkavegur hitaveiturof 27.10.26",
          "frá klukkan 22 og til kl. 2 eða á meðan vinnu stendur.",
          undefined,
          "Heitt vatn tekið af.",
        ),
        nordurorkaItem(
          "yfirfall-fraveitu",
          "Yfirfall fráveitu",
          "Frá miðvikudegi 28.10.2026 kl. 10 til fimmtudagsins 29.10.2026 kl. 12",
          undefined,
          "Hreinsistöð á yfirfalli.",
        ),
        nordurorkaItem(
          "kaldavatnstruflanir",
          "Kaldavatnstruflanir",
          "Eftir hádegi í dag, miðvikudag 28.10.2026",
        ),
        nordurorkaItem(
          "tilkynning",
          "Tilkynning",
          "Mánudaginn 4. janúar kl. 99",
          undefined,
          "Vinna við dreifikerfi.",
        ),
        nordurorkaItem("an-dags", "Lokun", "Í dag og fram eftir degi"),
      ]),
    );
    assert.deepEqual(
      parsed.map(({ id, type, location, start, end }) => ({
        id,
        type,
        location,
        start,
        end,
      })),
      [
        {
          id: "kaldavatnslokun",
          type: "cold-water",
          location: "Sundlaug Akureyrar og hótel Berjaya",
          start: "2026-10-29T08:00:00.000Z",
          end: "2026-10-29T12:00:00.000Z",
        },
        {
          id: "straumrof",
          type: "power",
          location: "Hafnarstræti",
          start: "2026-09-05T07:00:00.000Z",
          end: "2026-09-05T10:45:00.000Z",
        },
        {
          id: "gilsbakkavegur-hitaveiturof-27102026",
          type: "hot-water",
          location: null,
          start: "2026-10-27T22:00:00.000Z",
          end: "2026-10-28T02:00:00.000Z",
        },
        {
          id: "yfirfall-fraveitu",
          type: "sewage",
          location: null,
          start: "2026-10-28T10:00:00.000Z",
          end: "2026-10-29T12:00:00.000Z",
        },
        {
          id: "kaldavatnstruflanir",
          type: "cold-water",
          location: null,
          start: "2026-10-28T00:00:00.000Z",
          end: null,
        },
        {
          id: "tilkynning",
          type: null,
          location: null,
          start: "2027-01-04T00:00:00.000Z",
          end: null,
        },
      ],
    );
    assert.deepEqual(parsed[0], {
      source: "Norðurorka",
      id: "kaldavatnslokun",
      type: "cold-water",
      status: null,
      title: "Kaldavatnslokun",
      description: "Vegna vinnu við dreifikerfi verður lokað fyrir kalt vatn.",
      postcode: null,
      location: "Sundlaug Akureyrar og hótel Berjaya",
      start: "2026-10-29T08:00:00.000Z",
      end: "2026-10-29T12:00:00.000Z",
      url: "https://www.no.is/is/thjonusta/tilkynningar-um-thjonusturof/kaldavatnslokun",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("parseNordurorka - allows a page with no notices", () => {
  assert.deepEqual(parseNordurorka(nordurorkaPage([])), []);
});
