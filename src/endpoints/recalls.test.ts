import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import recalls from "./recalls.ts";

beforeEach(() => {
  clearCache();
});

function item(fields: Record<string, string>) {
  return `<item>${Object.entries(fields)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join("")}</item>`;
}

function feed(items: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <language>is</language>
    <title>Innkallanir | Matvælastofnun</title>
    <description>Missing description</description>
    <pubDate>Mon, 26 Oct 2026 20:12:16 +0000</pubDate>
    <generator>Moya 1.16.2</generator>
    <link>https://www.mast.is</link>
    ${items.join("\n")}
  </channel>
</rss>`;
}

const FEED = feed([
  item({
    title: "Aðskotahlutur í hnetublöndu",
    description: `<![CDATA[<p><img src="https://www.mast.is/static/news/sm/bonus-hnetublanda.jpeg" alt="Aðskotahlutur í hnetublöndu" /></p>Matvælastofnun varar við neyslu á einni framleiðslulotu af Bónus Hnetublöndu með trönuberjum og pistasíum vegna trábita sem fannst í vörunni.]]>`,
    pubDate: "Fri, 16 Oct 2026 15:21:00 +0000",
    link: "https://www.mast.is/is/um-mast/frettir/frettir/adskotahlutur-i-hnetublondu",
    guid: "https://www.mast.is/is/um-mast/frettir/frettir/adskotahlutur-i-hnetublondu",
  }),
  item({
    title: "Vanmerktur ofnæmisvaldur í Voga ídýfu krydd (hveiti) ",
    description: `<![CDATA[Matvælastofnun varar neytendur við sem hafa ofnæmi fyrir hveiti við Voga ídýfu krydd.&nbsp; Mjólkursamlag KS &amp; Matvælastofnun hafa
innkallað &quot;vörurnar&quot; &lt;2026&gt; &#225;.]]>`,
    pubDate: "Thu, 16 Jul 2026 11:53:00 +0000",
    link: "https://www.mast.is/is/um-mast/frettir/frettir/vanmerktur-ofnaemisvaldu-hveiti-i-voga-idyfu-krydd",
  }),
  item({
    title: "Salmonella í kryddi",
    pubDate: "Tue, 13 Oct 2026 14:53:00 +0000",
    link: "https://www.mast.is/is/um-mast/frettir/frettir/salmonella-i-kryddi",
  }),
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

async function expectError(message: string) {
  await recalls(new Request("http://localhost/x/recalls")).then(
    () => assert.fail("expected an error"),
    (error: Error) => assert.include(error.message, message),
  );
}

test("recalls - maps MAST's recalls feed to plain-text recalls", async () => {
  const server = mockFetch(FEED);
  try {
    const res = await recalls(new Request("http://localhost/x/recalls"));
    const data = await res.json();
    assert.isUndefined(validate(recalls.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=1800");
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.deepEqual(server.requested, ["https://www.mast.is/is/feed/2"]);
    assert.deepEqual(data, [
      {
        title: "Aðskotahlutur í hnetublöndu",
        description:
          "Matvælastofnun varar við neyslu á einni framleiðslulotu af Bónus Hnetublöndu með trönuberjum og pistasíum vegna trábita sem fannst í vörunni.",
        date: "2026-10-16T15:21:00.000Z",
        url: "https://www.mast.is/is/um-mast/frettir/frettir/adskotahlutur-i-hnetublondu",
        image: "https://www.mast.is/static/news/sm/bonus-hnetublanda.jpeg",
      },
      {
        title: "Vanmerktur ofnæmisvaldur í Voga ídýfu krydd (hveiti)",
        description:
          'Matvælastofnun varar neytendur við sem hafa ofnæmi fyrir hveiti við Voga ídýfu krydd. Mjólkursamlag KS & Matvælastofnun hafa innkallað "vörurnar" <2026> á.',
        date: "2026-07-16T11:53:00.000Z",
        url: "https://www.mast.is/is/um-mast/frettir/frettir/vanmerktur-ofnaemisvaldu-hveiti-i-voga-idyfu-krydd",
        image: null,
      },
      {
        title: "Salmonella í kryddi",
        description: "",
        date: "2026-10-13T14:53:00.000Z",
        url: "https://www.mast.is/is/um-mast/frettir/frettir/salmonella-i-kryddi",
        image: null,
      },
    ]);
  } finally {
    server.restore();
  }
});

test("recalls - pretty prints and caches the feed", async () => {
  const server = mockFetch(FEED);
  try {
    const res = await recalls(
      new Request("http://localhost/x/recalls?pretty=true"),
    );
    assert.include(await res.text(), "\n");
    await recalls(new Request("http://localhost/x/recalls"));
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("recalls - an empty feed fails the health check", async () => {
  const server = mockFetch(feed([]));
  try {
    const res = await recalls(new Request("http://localhost/x/recalls"));
    const data = await res.json();
    assert.deepEqual(data, []);
    assert.isDefined(validate(recalls.health.schema, data));
  } finally {
    server.restore();
  }
});

test("recalls - throws when MAST responds with an error", async () => {
  const server = mockFetch("", 503);
  try {
    await expectError("503");
  } finally {
    server.restore();
  }
});

test("recalls - throws when the feed is not RSS", async () => {
  const server = mockFetch("<html><body>Villa</body></html>");
  try {
    await expectError("Unexpected MAST recalls feed format");
  } finally {
    server.restore();
  }
});

test("recalls - throws when an item is missing fields", async () => {
  const items: Record<string, string>[] = [
    { title: "Salmonella í kryddi", link: "https://www.mast.is/a" },
    {
      title: "Salmonella í kryddi",
      pubDate: "Tue, 13 Oct 2026 14:53:00 +0000",
    },
    { link: "https://www.mast.is/a", pubDate: "Tue, 13 Oct 2026" },
  ];
  for (const fields of items) {
    clearCache();
    const server = mockFetch(feed([item(fields)]));
    try {
      await expectError("Unexpected MAST recalls feed item");
    } finally {
      server.restore();
    }
  }
});
