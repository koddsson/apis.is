import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import ski, { parseArea } from "./ski.ts";

beforeEach(() => {
  clearCache();
});

const UPDATED =
  '<span style="display:block;clear:both;font-size:9px;color:rgba(0,0,0,0.5);">Uppfært: 5/3/25 kl 18:41</span>';

function widget(sections: Record<string, string[]>, updated = UPDATED) {
  const lists = Object.entries(sections).map(
    ([heading, items]) =>
      `<div class="skidalyftur ski-small-margin skidalyftur-col2"><h4>${heading}</h4><ul class="list-opnanir">${items.join("")}</ul></div>`,
  );
  return `<html><div class="open-status"><ul><li class="open">Opið</li><li class="closed">Lokað</li></ul></div>${lists.join("")}${updated}<li class="menu-item">Bláfjöll</li></html>`;
}

const BLAFJOLL = widget({
  Heimatorfa: [
    '<li leid="1" class="closed hidden" desc="Toglyfta" lengd="596m" fall="102m" ferdatimi="" erfidleikastig="">Brettalyfta</li>',
    '<li leid="2" class="open " desc="" lengd="1011m" fall="214m" ferdatimi="3:45 min" erfidleikastig="">Drottningin, 4 sæta</li>',
    '<li leid="3" class="closed " desc="" lengd="762m" fall="223m" ferdatimi="" erfidleikastig="">Kóngurinn, 4 sæta</li>',
    '<li leid="5" class="open " desc="Kaðallyfta" lengd="100m" fall="10m" ferdatimi="">Patti broddgöltur</li>',
    '<li leid="6" class="open " desc="Færiband" lengd="" fall="" ferdatimi="" erfidleikastig="">Töfrateppi</li>',
    '<li leid="ex3" class="closed " desc="" lengd="" fall="" ferdatimi="" erfidleikastig="">Púkinn Park</li>',
    '<li leid="17" class="closed " desc="Skíðaleið" lengd="" fall="" ferdatimi="" erfidleikastig="Erfitt">Kóngsgil</li>',
    '<li leid="16" class="open " desc="Skíðaleið" lengd="" fall="" ferdatimi="" erfidleikastig="Miðlungs erfitt">Norðurleið</li>',
  ],
  Suðursvæði: [
    '<li leid="10" class="open " desc="Toglyfta" lengd="552m" fall="91m" ferdatimi="" erfidleikastig="">Mikki refur</li>',
    '<li leid="14" class="open " desc="" lengd="442m" fall="155m" ferdatimi="1:56 min" erfidleikastig="">Gosinn, 4 sæta</li>',
  ],
  Gönguleiðir: [
    '<li leid="" class="closed " desc="" lengd="" fall="" ferdatimi="" erfidleikastig="">Leiruhringur (1 km)</li>',
    '<li leid="" class="open " desc="" lengd="" fall="" ferdatimi="" erfidleikastig="">Grunnbraut (2.5 km)</li>',
    '<li leid="" class="open ">spor ca.3,6 km + æfingaspor</li>',
  ],
});

const SKALAFELL = widget(
  {
    Lyftur: [
      '<li leid="1" class="closed " desc="" lengd="1.200m" fall="273m" ferdatimi="" erfidleikastig="">Stólalyfta, 2 sæta</li>',
      '<li leid="2" class="closed " desc="Toglyfta" lengd="600m" fall="122m" ferdatimi="" erfidleikastig="">I-lyfta</li>',
    ],
    Gönguleiðir: [
      '<li leid="" class="closed " desc="" lengd="" fall="" ferdatimi="" erfidleikastig="">Gönguleið I (5 km)</li>',
      '<li leid="" class="closed " desc="" lengd="" fall="" ferdatimi="" erfidleikastig="">Gönguleið II (10,5 km)</li>',
      '<li leid="" class="closed " desc="" lengd="" fall="" ferdatimi="" erfidleikastig="">Upplýst braut</li>',
      '<li leid="" class="closed ">Lokað í dag.</li>',
      '<li leid="" class="closed ">Closed &amp; groomed.</li>',
    ],
  },
  UPDATED.replace("5/3/25 kl 18:41", "26/10/26 kl 00:00"),
);

function mockFetch(responses: { blafjoll?: Response; skalafell?: Response }) {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  const userAgents: Array<string | null> = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    requested.push(url);
    userAgents.push(new Headers(init?.headers).get("User-Agent"));
    if (url.includes("/skalafell/")) {
      return Promise.resolve(responses.skalafell ?? new Response(SKALAFELL));
    }
    return Promise.resolve(responses.blafjoll ?? new Response(BLAFJOLL));
  };
  return {
    requested,
    userAgents,
    restore: () => (globalThis.fetch = originalFetch),
  };
}

function get(query = "") {
  return ski(new Request(`http://localhost/x/ski${query}`));
}

test("ski - returns lifts and trails for both areas", async () => {
  const server = mockFetch({});
  try {
    const res = await get();
    const data = await res.json<Array<Record<string, unknown>>>();
    assert.isUndefined(validate(ski.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
    assert.deepEqual(server.requested, [
      "https://skidasvaedi.is/",
      "https://skidasvaedi.is/skalafell/svaedi/",
    ]);
    assert.deepEqual(server.userAgents, [
      "apis.is (+https://apis.is)",
      "apis.is (+https://apis.is)",
    ]);

    const [blafjoll, skalafell] = data as Array<{
      area: string;
      name: string;
      updated: string;
      lifts: Array<Record<string, unknown>>;
      trails: Array<Record<string, unknown>>;
      notes: string[];
    }>;
    assert.equal(blafjoll.area, "blafjoll");
    assert.equal(blafjoll.name, "Bláfjöll");
    assert.equal(blafjoll.updated, "2025-03-05T18:41:00.000Z");
    assert.notInclude(
      blafjoll.lifts.map((lift) => lift.name),
      "Brettalyfta",
    );
    assert.deepEqual(blafjoll.lifts[0], {
      id: "2",
      name: "Drottningin, 4 sæta",
      section: "Heimatorfa",
      type: "chairlift",
      open: true,
      length: 1011,
      drop: 214,
      rideTime: 225,
      difficulty: null,
    });
    assert.deepEqual(
      blafjoll.lifts.map((lift) => [lift.name, lift.type, lift.difficulty]),
      [
        ["Drottningin, 4 sæta", "chairlift", null],
        ["Kóngurinn, 4 sæta", "chairlift", null],
        ["Patti broddgöltur", "rope-tow", null],
        ["Töfrateppi", "carpet", null],
        ["Púkinn Park", null, null],
        ["Kóngsgil", "slope", "difficult"],
        ["Norðurleið", "slope", "intermediate"],
        ["Mikki refur", "surface-lift", null],
        ["Gosinn, 4 sæta", "chairlift", null],
      ],
    );
    assert.deepEqual(blafjoll.lifts[3], {
      id: "6",
      name: "Töfrateppi",
      section: "Heimatorfa",
      type: "carpet",
      open: true,
      length: null,
      drop: null,
      rideTime: null,
      difficulty: null,
    });
    assert.equal(blafjoll.lifts[7].section, "Suðursvæði");
    assert.deepEqual(blafjoll.trails, [
      { name: "Leiruhringur", open: false, length: 1000 },
      { name: "Grunnbraut", open: true, length: 2500 },
    ]);
    assert.deepEqual(blafjoll.notes, ["spor ca.3,6 km + æfingaspor"]);

    assert.equal(skalafell.area, "skalafell");
    assert.equal(skalafell.name, "Skálafell");
    assert.equal(skalafell.updated, "2026-10-26T00:00:00.000Z");
    assert.deepEqual(skalafell.lifts[0], {
      id: "1",
      name: "Stólalyfta, 2 sæta",
      section: "Lyftur",
      type: "chairlift",
      open: false,
      length: 1200,
      drop: 273,
      rideTime: null,
      difficulty: null,
    });
    assert.deepEqual(skalafell.trails, [
      { name: "Gönguleið I", open: false, length: 5000 },
      { name: "Gönguleið II", open: false, length: 10500 },
      { name: "Upplýst braut", open: false, length: null },
    ]);
    assert.deepEqual(skalafell.notes, ["Lokað í dag.", "Closed & groomed."]);
  } finally {
    server.restore();
  }
});

test("ski - filters by area and caches each area", async () => {
  const server = mockFetch({});
  try {
    const data = await (await get("?area=skalafell&pretty=true")).json<
      Array<{ area: string }>
    >();
    assert.deepEqual(
      data.map((area) => area.area),
      ["skalafell"],
    );
    await get();
    await get("?area=blafjoll");
    assert.deepEqual(server.requested, [
      "https://skidasvaedi.is/skalafell/svaedi/",
      "https://skidasvaedi.is/",
    ]);
  } finally {
    server.restore();
  }
});

test("ski - rejects an unknown area", async () => {
  const server = mockFetch({});
  try {
    const res = await get("?area=hlidarfjall");
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: "area must be one of blafjoll, skalafell",
    });
    assert.deepEqual(server.requested, []);
  } finally {
    server.restore();
  }
});

test("ski - throws when the upstream fails", async () => {
  const server = mockFetch({
    skalafell: new Response("unavailable", { status: 503 }),
  });
  try {
    try {
      await get();
      assert.fail("expected an error");
    } catch (error) {
      assert.equal((error as Error).message, "Failed to fetch Skálafell: 503");
    }
  } finally {
    server.restore();
  }
});

test("ski - throws when the page format changes", () => {
  assert.throws(
    () => parseArea("blafjoll", "<html>Nothing here</html>"),
    "Lift status not found on https://skidasvaedi.is/",
  );
  assert.throws(
    () =>
      parseArea(
        "skalafell",
        widget({
          Gönguleiðir: [
            '<li leid="" class="closed " lengd="">Gönguleið I (5 km)</li>',
          ],
        }),
      ),
    "No lifts found on https://skidasvaedi.is/skalafell/svaedi/",
  );
  assert.throws(
    () =>
      parseArea(
        "blafjoll",
        widget({ Lyftur: ['<li leid="1" lengd="100m">I-lyfta</li>'] }),
      ),
    "Unexpected lift status: undefined",
  );
  assert.throws(
    () =>
      parseArea(
        "blafjoll",
        widget(
          { Lyftur: ['<li leid="1" class="open" lengd="100m">I-lyfta</li>'] },
          "<span>Uppfært: í dag</span>",
        ),
      ),
    "Ski area update time not found on page",
  );
});
