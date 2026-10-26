import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import seaIce from "./sea-ice.ts";

beforeEach(() => {
  clearCache();
});

function page(title: string, notices: string[]) {
  return `<!DOCTYPE html><html><body><div class="article"><div class="boxbody">
	<h1>${title}</h1>

${notices
  .map(
    (notice, i) => `<div class="textforec">${notice}</div>
	<script>
	jQuery('a.seaice_gal${i}').fancybox({
		'titlePosition' : 'inside',
		'titleFormat' : formatTitle
	});
	</script>
	`,
  )
  .join("")}
</div></div><script>
VI.seaice.initBulletins();
</script></body></html>`;
}

function image(i: number, title: string, path: string) {
  return `<td><a class="seaice_gal${i}" rel="seaice${i}" title="${title}" href="/photos_ll/seaice/${path}._large.png"
					><img src="/photos_ll/seaice/${path}._thumbnail.png" alt="Styddu til að skoða stærri mynd" /></a><div>${title}</div></td>`;
}

const RECENT = page("Hafístilkynningar síðustu 30 daga", [
  `<h2>13. okt. 2026 10:00 - Byggt á gervitunglamynd</h2><p>Hafískort byggt á gervitunglamyndum frá Sentinel tunglinu 13. október. Engan samfelldan hafís er að sjá á svæðinu, en borgarísjakar geta verið á sveimi.</p><h3>Kort og myndir</h3><table class="imgs"><tr>${image(0, "", "2026/1832")}<td></td><td></td></tr></table>`,
  `<h2>01. okt. 2026 16:23 - Skip</h2><p>Big iceberg north east of Hornstrandir at 66°47N  21°47W. Clearly visible on Radar.</p><h3 class="s_ice_head">Hnit á stökum hafís</h3><ul><li>66:47N, 21:47</li></ul><h3>Kort og myndir</h3><table class="imgs"><tr>${image(1, "Sea ice map", "2026/1827")}${image(1, "", "2026/1828")}<td></td></tr></table>`,
]);

const YEAR = page("Hafístilkynningar - 2018", [
  `<h2>10. jún. 2018 23:47 - Byggt á gervitunglamynd</h2><p>Hafís við Ísland 10. júní 2018 kl. 19:06 GMT<br/>
<br/>
Á gervitunglamynd frá því kl. 19:06 í gærkvöldi má sjá dreifðan hafís um 4 sjómílur austan við Horn.</p><h3 class="s_ice_head">Hnit á stökum hafís</h3><ul><li>66.3271N, 21.511W</li></ul><h3 class="e_ice_head">Hnit á hafísjaðri</h3><ul><li>66.4309N, 28.167W</li><li>65°43n-029°45v</li><li>67:30´N-025°30´V</li><li>66:47,44N, 23:38,10W </li><li></li></ul><h3>Kort og myndir</h3><table class="imgs"><tr>${image(0, "Sea ice map", "2018/840")}<td></td><td></td></tr></table>`,
  `<h2>05. nóv. 2018 13:06 - Óskilgreind tegund athugunar</h2><p>Kort byggt á hafískorti Dönsku veðurstofunnar (DMI) <a href="http://www.dmi.dk/hav/groenland-og-arktis/iskort/">Iskort</a>. Skýjað er á Grænlandssundi &amp; ísjaðarinn sést ekki.</p>`,
  `<h2>27. sep. 2018 07:25 - Skip</h2><p>Fiskibátur tilkynnir um borgarísjaka.</p><h3 class="s_ice_head">Hnit á stökum hafís</h3><ul><li>65:48:58N, 29:07:21W</li><li>66:30:68N, 25:52:61W</li><li>við Horn</li></ul>`,
  `<h2>02. jan. 2018 12:04 - Athugun frá landi</h2><p>Borgarísjaki sést frá Skagatá.</p>`,
  `<h2>03. jan. 2018 12:04 - Flug</h2><p>Ísjaðar.</p>`,
  `<h2>04. jan. 2018 12:04 - Flug Landhelgisgæslunnar</h2><p>Ísjaðar.</p>`,
]);

function mockFetch(body: string, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    requested.push(input.toString());
    return Promise.resolve(new Response(body, { status }));
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

async function rejects(promise: Promise<unknown>, message: string) {
  await promise.then(
    () => assert.fail("expected an error"),
    (error: Error) => assert.include(error.message, message),
  );
}

test("sea-ice - parses the last 30 days of notices", async () => {
  const server = mockFetch(RECENT);
  try {
    const res = await seaIce(new Request("http://localhost/x/sea-ice"));
    const data = await res.json();
    assert.isUndefined(validate(seaIce.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=1800");
    assert.deepEqual(server.requested, [
      "https://www.vedur.is/hafis/tilkynningar",
    ]);
    assert.deepEqual(data, [
      {
        time: "2026-10-13T10:00:00.000Z",
        observation: "satellite",
        text: "Hafískort byggt á gervitunglamyndum frá Sentinel tunglinu 13. október. Engan samfelldan hafís er að sjá á svæðinu, en borgarísjakar geta verið á sveimi.",
        isolatedIce: [],
        iceEdge: [],
        images: [
          {
            url: "https://www.vedur.is/photos_ll/seaice/2026/1832._large.png",
            caption: null,
          },
        ],
      },
      {
        time: "2026-10-01T16:23:00.000Z",
        observation: "ship",
        text: "Big iceberg north east of Hornstrandir at 66°47N 21°47W. Clearly visible on Radar.",
        isolatedIce: [
          { text: "66:47N, 21:47", latitude: 66.78333, longitude: -21.78333 },
        ],
        iceEdge: [],
        images: [
          {
            url: "https://www.vedur.is/photos_ll/seaice/2026/1827._large.png",
            caption: "Sea ice map",
          },
          {
            url: "https://www.vedur.is/photos_ll/seaice/2026/1828._large.png",
            caption: null,
          },
        ],
      },
    ]);
  } finally {
    server.restore();
  }
});

test("sea-ice - fetches a whole year and parses hand-typed positions", async () => {
  const server = mockFetch(YEAR);
  try {
    const res = await seaIce(
      new Request("http://localhost/x/sea-ice?year=2018&pretty=true"),
    );
    const body = await res.text();
    assert.include(body, "\n");
    const data = JSON.parse(body);
    assert.isUndefined(validate(seaIce.health.schema, data));
    assert.deepEqual(server.requested, [
      "https://www.vedur.is/hafis/tilkynningar?year=2018",
    ]);

    const [satellite, unspecified, ship, land, flight, coastGuard] = data;
    assert.equal(satellite.time, "2018-06-10T23:47:00.000Z");
    assert.equal(
      satellite.text,
      "Hafís við Ísland 10. júní 2018 kl. 19:06 GMT\nÁ gervitunglamynd frá því kl. 19:06 í gærkvöldi má sjá dreifðan hafís um 4 sjómílur austan við Horn.",
    );
    assert.deepEqual(satellite.isolatedIce, [
      { text: "66.3271N, 21.511W", latitude: 66.3271, longitude: -21.511 },
    ]);
    assert.deepEqual(satellite.iceEdge, [
      { text: "66.4309N, 28.167W", latitude: 66.4309, longitude: -28.167 },
      { text: "65°43n-029°45v", latitude: 65.71667, longitude: -29.75 },
      { text: "67:30´N-025°30´V", latitude: 67.5, longitude: -25.5 },
      { text: "66:47,44N, 23:38,10W", latitude: 66.79067, longitude: -23.635 },
    ]);

    assert.equal(unspecified.observation, "unspecified");
    assert.equal(unspecified.time, "2018-11-05T13:06:00.000Z");
    assert.equal(
      unspecified.text,
      "Kort byggt á hafískorti Dönsku veðurstofunnar (DMI) Iskort. Skýjað er á Grænlandssundi & ísjaðarinn sést ekki.",
    );
    assert.deepEqual(unspecified.images, []);

    assert.deepEqual(ship.isolatedIce, [
      {
        text: "65:48:58N, 29:07:21W",
        latitude: 65.81611,
        longitude: -29.1225,
      },
      { text: "66:30:68N, 25:52:61W", latitude: null, longitude: null },
      { text: "við Horn", latitude: null, longitude: null },
    ]);
    assert.equal(land.observation, "land");
    assert.equal(flight.observation, "aircraft");
    assert.equal(coastGuard.observation, "coast-guard-aircraft");
  } finally {
    server.restore();
  }
});

test("sea-ice - caches each year separately", async () => {
  const server = mockFetch(RECENT);
  try {
    await seaIce(new Request("http://localhost/x/sea-ice"));
    await seaIce(new Request("http://localhost/x/sea-ice"));
    await seaIce(new Request("http://localhost/x/sea-ice?year=2026"));
    assert.equal(server.requested.length, 2);
  } finally {
    server.restore();
  }
});

test("sea-ice - validates the year", async () => {
  const server = mockFetch(RECENT);
  try {
    const invalid = await seaIce(
      new Request("http://localhost/x/sea-ice?year=abc"),
    );
    assert.equal(invalid.status, 400);

    const early = await seaIce(
      new Request("http://localhost/x/sea-ice?year=2010"),
    );
    assert.equal(early.status, 404);

    const future = new Date().getUTCFullYear() + 1;
    const late = await seaIce(
      new Request(`http://localhost/x/sea-ice?year=${future}`),
    );
    assert.equal(late.status, 404);
    assert.deepEqual(server.requested, []);
  } finally {
    server.restore();
  }
});

test("sea-ice - returns no notices when none were issued", async () => {
  const server = mockFetch(page("Hafístilkynningar síðustu 30 daga", []));
  try {
    const res = await seaIce(new Request("http://localhost/x/sea-ice"));
    assert.deepEqual(await res.json(), []);
  } finally {
    server.restore();
  }
});

test("sea-ice - throws when Veðurstofan responds with an error", async () => {
  const server = mockFetch("", 503);
  try {
    await rejects(seaIce(new Request("http://localhost/x/sea-ice")), "503");
  } finally {
    server.restore();
  }
});

test("sea-ice - throws when the page changes", async () => {
  const cases: Array<[string, string]> = [
    ["<html><body>Villa</body></html>", "not found on page"],
    [
      page("Hafístilkynningar", ["<h2>01. okt. 2026 16:23 - Kafbátur</h2>"]),
      "Unexpected sea ice notice",
    ],
    [
      page("Hafístilkynningar", ["<p>Engin fyrirsögn</p>"]),
      "Unexpected sea ice notice",
    ],
    [
      page("Hafístilkynningar", ["<h2>01. oct. 2026 16:23 - Skip</h2>"]),
      "Unexpected time",
    ],
    [
      page("Hafístilkynningar", ["<h2>2026-10-01 16:23 - Skip</h2>"]),
      "Unexpected time",
    ],
  ];
  for (const [body, message] of cases) {
    clearCache();
    const server = mockFetch(body);
    try {
      await rejects(seaIce(new Request("http://localhost/x/sea-ice")), message);
    } finally {
      server.restore();
    }
  }
});
