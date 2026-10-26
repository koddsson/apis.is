import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import aurora, { parseAurora } from "./aurora.ts";

beforeEach(() => {
  clearCache();
});

function imgConf(index: number, title: string, slug: string, dir: string) {
  return `VI.imgConf[${index}] = {'title':'${title}','url':'${slug}','0' : '/photos/${dir}/261026_1500_1.png','tag0'  : new Date(2026,10-1,26,16,0),'1' : '/photos/${dir}/261026_1500_2.png','tag1'  : new Date(2026,10-1,27,13,0),'mapCtrl':null };`;
}

const IDX = `VI.data.aurora.idx = {261026: {act: 2,
sun: ['s0','17:30','08:55','18:21','08:03'],
moon: ['16','t1','','']},
261031: {act: 5,
sun: ['s0','17:15','09:10','18:06','08:17'],
moon: ['21','t2','20:23','']},
261102: {act: 3,
sun: ['s0','17:07','09:17','18:02','08:23'],
moon: ['23','t2','00:37','']},
261231: {act: 9,
sun: ['s0','15:38','11:20','17:45','09:12'],
moon: ['0','t0','','']},
270420: {act: 0,
sun: ['s1','21:40','05:41','',''],
moon: ['3','t3','23:10','']},
270421: {act: 1,
sun: ['s1','21:43','05:38','',''],
moon: ['4','t4','14:02','01:15']},
270422: {act: 1,
sun: ['s1','21:46','05:35','',''],
moon: ['5','t5','02:10','13:30']}}`;

function page(idx = IDX, maps = 5) {
  const confs = [
    imgConf(0, "Samsett lág og miðský", "skyjahula", "isl_skyjahula2"),
    imgConf(1, "Lágský", "lagsky", "harmonie_island_lcc"),
    imgConf(2, "Miðský", "midsky", "harmonie_island_mcc"),
    imgConf(3, "Háský", "hasky", "harmonie_island_hcc"),
    imgConf(4, "Samsett", "samsett", "harmonie_island_tcc_lcc_mcc_hcc"),
  ].slice(0, maps);
  return `<script>
VI.conf = {
 'currMap':0,
 'sliderDays' : 6
};

VI.imgConf = new Array();

${confs.join("")}

</script>
<script>
var VI;
if (VI.data.aurora == undefined) VI.data.aurora = {};

${idx}

if (VI.conf == undefined) VI.conf = {};
</script>`;
}

function mockFetch(body: string, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: Request[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    requested.push(new Request(input, init));
    return Promise.resolve(new Response(body, { status }));
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

test("aurora - parses nights and cloud cover maps", async () => {
  const server = mockFetch(page());
  try {
    const res = await aurora(new Request("http://localhost/x/aurora"));
    const data = await res.json<ReturnType<typeof parseAurora>>();
    assert.isUndefined(validate(aurora.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=1800");
    assert.equal(
      server.requested[0].url,
      "https://www.vedur.is/vedur/spar/nordurljos/",
    );
    assert.equal(
      server.requested[0].headers.get("User-Agent"),
      "apis.is (+https://apis.is)",
    );

    assert.deepEqual(data.nights[0], {
      date: "2026-10-26",
      activity: 2,
      activityLabel: "Low",
      sunset: "2026-10-26T17:30:00.000Z",
      sunrise: "2026-10-27T08:55:00.000Z",
      darkness: {
        start: "2026-10-26T18:21:00.000Z",
        end: "2026-10-27T08:03:00.000Z",
      },
      moon: { age: 16, visibility: "all-night", rise: null, set: null },
    });
    assert.deepEqual(
      data.nights.map(({ date, activityLabel, moon }) => [
        date,
        activityLabel,
        moon,
      ]),
      [
        [
          "2026-10-26",
          "Low",
          { age: 16, visibility: "all-night", rise: null, set: null },
        ],
        [
          "2026-10-31",
          "High",
          {
            age: 21,
            visibility: "rises",
            rise: "2026-10-31T20:23:00.000Z",
            set: null,
          },
        ],
        [
          "2026-11-02",
          "Moderate",
          {
            age: 23,
            visibility: "rises",
            rise: "2026-11-03T00:37:00.000Z",
            set: null,
          },
        ],
        [
          "2026-12-31",
          "Extreme",
          { age: 0, visibility: "not-visible", rise: null, set: null },
        ],
        [
          "2027-04-20",
          "Minimum",
          {
            age: 3,
            visibility: "sets",
            rise: null,
            set: "2027-04-20T23:10:00.000Z",
          },
        ],
        [
          "2027-04-21",
          "Quiet",
          {
            age: 4,
            visibility: "rises-and-sets",
            rise: "2027-04-21T14:02:00.000Z",
            set: "2027-04-22T01:15:00.000Z",
          },
        ],
        [
          "2027-04-22",
          "Quiet",
          {
            age: 5,
            visibility: "sets-and-rises",
            rise: "2027-04-22T13:30:00.000Z",
            set: "2027-04-23T02:10:00.000Z",
          },
        ],
      ],
    );
    assert.isNull(data.nights[4].darkness);

    assert.deepEqual(
      data.cloudCover.map(({ layer }) => layer),
      ["low-and-mid", "low", "mid", "high", "total"],
    );
    assert.deepEqual(data.cloudCover[0].images, [
      {
        time: "2026-10-26T16:00:00.000Z",
        url: "https://www.vedur.is/photos/isl_skyjahula2/261026_1500_1.png",
      },
      {
        time: "2026-10-27T13:00:00.000Z",
        url: "https://www.vedur.is/photos/isl_skyjahula2/261026_1500_2.png",
      },
    ]);
  } finally {
    server.restore();
  }
});

test("aurora - filters by date and validates it", async () => {
  const server = mockFetch(page());
  try {
    const res = await aurora(
      new Request("http://localhost/x/aurora?date=2026-10-26&pretty=true"),
    );
    const text = await res.text();
    assert.include(text, "\n");
    const data = JSON.parse(text);
    assert.deepEqual(
      data.nights.map(({ date }: { date: string }) => date),
      ["2026-10-26"],
    );
    assert.deepEqual(data.cloudCover[0].images.length, 1);

    const later = await aurora(
      new Request("http://localhost/x/aurora?date=2026-10-31"),
    );
    assert.deepEqual((await later.json<{ cloudCover: [] }>()).cloudCover, []);

    const missing = await aurora(
      new Request("http://localhost/x/aurora?date=2026-01-01"),
    );
    assert.equal(missing.status, 404);

    const invalid = await aurora(
      new Request("http://localhost/x/aurora?date=tomorrow"),
    );
    assert.equal(invalid.status, 400);
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("aurora - throws when Veðurstofa responds with an error", async () => {
  const server = mockFetch("", 503);
  try {
    await aurora(new Request("http://localhost/x/aurora")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, "503"),
    );
  } finally {
    server.restore();
  }
});

test("aurora - throws when the page format changes", () => {
  const night = (sun: string, moon: string, act = 2) =>
    page(`VI.data.aurora.idx = {261026: {act: ${act},
sun: [${sun}],
moon: [${moon}]}}`);
  const s0 = "'s0','17:30','08:55','18:21','08:03'";
  const cases: Array<[string, string]> = [
    ["<html></html>", "Aurora forecast not found"],
    [page("VI.data.aurora.idx = {261026: {act: 2}}"), "No nights"],
    [night(s0, "'16','t1','',''", 12), "Unexpected aurora activity"],
    [night("'s9','','','',''", "'16','t1','',''"), "Unexpected sun data"],
    [night(s0, "'16','t9','',''"), "Unexpected moon data"],
    [night(s0, "'16','t2','',''"), "Unexpected time"],
    [page(IDX, 0), "Cloud cover maps not found"],
    [
      page(IDX, 1).replace("skyjahula", "nytt"),
      "Unknown cloud cover layer: nytt",
    ],
    [
      page(IDX, 1).replace("'url':'skyjahula',", ""),
      "Unknown cloud cover layer",
    ],
    [
      page(IDX, 1).replace(/'0' : .*'mapCtrl'/, "'mapCtrl'"),
      "No cloud cover images",
    ],
  ];
  for (const [html, message] of cases) {
    assert.throws(() => parseAurora(html), message);
  }
});
