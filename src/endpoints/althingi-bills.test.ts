import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import { althingiBill, althingiBills } from "./althingi-bills.ts";

beforeEach(() => {
  clearCache();
});

const LIST_URL = "https://www.althingi.is/altext/xml/thingmalalisti/";

function issue(
  number: number,
  category: "A" | "B",
  name: string,
  body: string,
) {
  return `<mál málsnúmer='${number}' þingnúmer='158' málsflokkur='${category}'>
<málsheiti>${name}</málsheiti>
${body}
<xml>https://www.althingi.is/altext/xml/thingmalalisti/thingmal/?lthing=158&amp;malnr=${number}</xml>
<rss>https://www.althingi.is/rss/frettir.rss?feed=ferill&amp;malnr=${number}&amp;lthing=158</rss>
</mál>`;
}

function list(...issues: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<málaskrá><!-- listinn sýnir yfirstandandi þing, tilgreina má þingnúmer til að skoða eldri þing, t.d. thingmalalisti/?lthing=139 -->
${issues.join("")}</málaskrá>`;
}

const BILL = issue(
  3,
  "A",
  "menningarminjar og mannvirki",
  `<efnisgreining>álit Minjastofnunar Íslands vegna húsa og mannvirkja</efnisgreining>
<málstegund málstegund='l'><heiti>Frumvarp til laga</heiti><heiti2>lagafrumvarp</heiti2></málstegund>
<html>https://www.althingi.is//thingstorf/thingmalalistar-eftir-thingum/ferill/158/3/?ltg=158&amp;mnr=3</html>`,
);

const WRITTEN_QUESTION = issue(
  85,
  "A",
  "Bókasafnssjóður höfunda",
  `<efnisgreining></efnisgreining>
<málstegund málstegund='q'><heiti>Fyrirspurn</heiti><heiti2>fyrirspurn til skrifl. svars</heiti2></málstegund>
<fyrirspurntil>menningar-, nýsköpunar- og háskólaráðherra</fyrirspurntil><html>https://www.althingi.is//thingstorf/thingmalalistar-eftir-thingum/ferill/158/85/?ltg=158&amp;mnr=85</html>`,
);

const REPORT_REQUEST = issue(
  149,
  "A",
  "ójöfnuður, félagslegt landslag og félagslegur hreyfanleiki á Íslandi",
  `<efnisgreining></efnisgreining>
<málstegund málstegund='b'><heiti>Beiðni um skýrslu</heiti><heiti2>beiðni um skýrslu</heiti2></málstegund>
<html>https://www.althingi.is//thingstorf/thingmalalistar-eftir-thingum/ferill/158/149/?ltg=158&amp;mnr=149</html>`,
);

const SPECIAL_DEBATE = `<mál málsnúmer='131' þingnúmer='158' málsflokkur='B'>
<málsheiti>Lyfjagjöf á hjúkrunarheimilum og umönnun aldraðra</málsheiti>
<málstegund málstegund='um'><heiti>sérstök umræða</heiti></málstegund>
<html>https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/bferill/?ltg=158&amp;mnr=131</html>
<xml>http://www.althingi.is/altext/xml/thingmalalisti/bmal/?lthing=158&amp;malnr=131</xml>
</mál>`;

const LIST = list(BILL, WRITTEN_QUESTION, REPORT_REQUEST, SPECIAL_DEBATE);

function document(number: number, issue: number, time: string, type: string) {
  const padded = String(number).padStart(4, "0");
  return `<þingskjal skjalsnúmer='${number}' málsnúmer='${issue}' þingnúmer='158'>
<útbýting>${time}</útbýting>
<skjalategund>${type}</skjalategund>

<slóð>
<html>http://www.althingi.is/altext/158/s/${padded}.html</html>
<pdf>http://www.althingi.is/altext/pdf/158/s/${padded}.pdf</pdf>
<xml>http://www.althingi.is/altext/xml/thingskjol/thingskjal/?lthing=158&amp;skjalnr=${number}</xml>
</slóð>
</þingskjal>`;
}

function detail(number: number, mál: string, documents: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<þingmál>
<mál málsnúmer='${number}' þingnúmer='158'>
${mál}<slóð>
<html>http://www.althingi.is/dba-bin/ferill.pl?ltg=158&amp;mnr=${number}</html>
<xml>http://www.althingi.is/altext/xml/thingmalalisti/thingmal/?lthing=158&amp;malnr=${number}</xml>
<rss>http://www.althingi.is/rss/frettir.rss?feed=ferill&amp;malnr=${number}&amp;lthing=158</rss>
</slóð>
</mál>
<tengdMál>
</tengdMál>
<efnisflokkar>
</efnisflokkar>
<þingskjöl>
${documents}
</þingskjöl><atkvæðagreiðslur></atkvæðagreiðslur><umsagnabeiðnir frestur=''></umsagnabeiðnir><erindaskrá></erindaskrá><ræður></ræður>
</þingmál>`;
}

const BILL_DETAIL = detail(
  3,
  `<málsheiti>menningarminjar og mannvirki</málsheiti>
<efnisgreining>álit Minjastofnunar Íslands vegna húsa og mannvirkja</efnisgreining>
<málstegund málstegund='l'>
<heiti>Frumvarp til laga</heiti>
<heiti2>lagafrumvarp</heiti2>
</málstegund>
<staðamáls>Samþykkt sem lög frá Alþingi.</staðamáls>`,
  document(3, 3, "2026-09-09 19:48", "stjórnarfrumvarp") +
    document(250, 3, "2026-10-16 16:20", "nál. með brtt.") +
    document(307, 3, "2026-10-22 15:31", "lög í heild"),
);

const REPORT_REQUEST_DETAIL = detail(
  149,
  `<málsheiti>ójöfnuður, félagslegt landslag og félagslegur hreyfanleiki á Íslandi</málsheiti>
<efnisgreining></efnisgreining>
<málstegund málstegund='b'>
<heiti>Beiðni um skýrslu</heiti>
<heiti2>beiðni um skýrslu</heiti2>
</málstegund>
`,
  document(149, 149, "2026-10-05 13:18", "beiðni um skýrslu"),
);

const NOT_FOUND = `<?xml version="1.0" encoding="UTF-8"?>
<þingmál>
<!-- finn ekki málaupplýsingar -->
<þingskjöl>
</þingskjöl><atkvæðagreiðslur></atkvæðagreiðslur><umsagnabeiðnir frestur=''></umsagnabeiðnir><erindaskrá></erindaskrá><ræður></ræður>
</þingmál>`;

function mockFetch(routes: Record<string, string | number>) {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = input.toString();
    requested.push(url);
    const body = routes[url];
    if (body === undefined) throw new Error(`Unexpected fetch ${url}`);
    return Promise.resolve(
      typeof body === "number"
        ? new Response("", { status: body })
        : new Response(body),
    );
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

function detailUrl(number: number) {
  return `${LIST_URL}thingmal/?lthing=158&malnr=${number}`;
}

async function expectError(
  routes: Record<string, string | number>,
  path: string,
  message: string,
) {
  const server = mockFetch(routes);
  try {
    const number = path.split("/")[4];
    const request = new Request(`http://localhost${path}`);
    await (number
      ? althingiBill(request, { number })
      : althingiBills(request)
    ).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, message),
    );
  } finally {
    server.restore();
  }
}

test("althingi bills - lists the session's A issues newest first", async () => {
  const server = mockFetch({ [LIST_URL]: LIST });
  try {
    const res = await althingiBills(
      new Request("http://localhost/x/althingi/bills"),
    );
    const data = await res.json();
    assert.isUndefined(validate(althingiBills.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=1800");
    assert.deepEqual(data, [
      {
        session: 158,
        number: 149,
        name: "ójöfnuður, félagslegt landslag og félagslegur hreyfanleiki á Íslandi",
        description: null,
        type: "report-request",
        addressedTo: null,
        url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=149",
      },
      {
        session: 158,
        number: 85,
        name: "Bókasafnssjóður höfunda",
        description: null,
        type: "written-question",
        addressedTo: "menningar-, nýsköpunar- og háskólaráðherra",
        url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=85",
      },
      {
        session: 158,
        number: 3,
        name: "menningarminjar og mannvirki",
        description: "álit Minjastofnunar Íslands vegna húsa og mannvirkja",
        type: "bill",
        addressedTo: null,
        url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=3",
      },
    ]);
  } finally {
    server.restore();
  }
});

test("althingi bills - filters by type", async () => {
  const server = mockFetch({ [LIST_URL]: LIST });
  try {
    const res = await althingiBills(
      new Request("http://localhost/x/althingi/bills?type=bill&pretty=true"),
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((b: { number: number }) => b.number),
      [3],
    );
    const none = await althingiBills(
      new Request("http://localhost/x/althingi/bills?type=no-confidence"),
    );
    assert.deepEqual(await none.json(), []);
    assert.equal(server.requested.length, 1);
  } finally {
    server.restore();
  }
});

test("althingi bills - rejects an unknown type", async () => {
  const server = mockFetch({});
  try {
    for (const type of ["Frumvarp", "l", ""]) {
      const res = await althingiBills(
        new Request(`http://localhost/x/althingi/bills?type=${type}`),
      );
      assert.equal(res.status, 400, type);
    }
    assert.equal(server.requested.length, 0);
  } finally {
    server.restore();
  }
});

test("althingi bills - returns an empty list before any issue is filed", async () => {
  const server = mockFetch({ [LIST_URL]: list() });
  try {
    const res = await althingiBills(
      new Request("http://localhost/x/althingi/bills"),
    );
    assert.deepEqual(await res.json(), []);
  } finally {
    server.restore();
  }
});

test("althingi bill - adds status and documents", async () => {
  const server = mockFetch({
    [LIST_URL]: LIST,
    [detailUrl(3)]: BILL_DETAIL,
    [detailUrl(149)]: REPORT_REQUEST_DETAIL,
  });
  try {
    const res = await althingiBill(
      new Request("http://localhost/x/althingi/bills/3"),
      { number: "3" },
    );
    const data = await res.json();
    assert.isUndefined(validate(althingiBill.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=1800");
    assert.deepEqual(data, {
      session: 158,
      number: 3,
      name: "menningarminjar og mannvirki",
      description: "álit Minjastofnunar Íslands vegna húsa og mannvirkja",
      type: "bill",
      addressedTo: null,
      url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=3",
      status: "Samþykkt sem lög frá Alþingi.",
      documents: [
        {
          number: 3,
          type: "stjórnarfrumvarp",
          time: "2026-09-09T19:48:00Z",
          url: "https://www.althingi.is/altext/158/s/0003.html",
          pdf: "https://www.althingi.is/altext/pdf/158/s/0003.pdf",
        },
        {
          number: 250,
          type: "nál. með brtt.",
          time: "2026-10-16T16:20:00Z",
          url: "https://www.althingi.is/altext/158/s/0250.html",
          pdf: "https://www.althingi.is/altext/pdf/158/s/0250.pdf",
        },
        {
          number: 307,
          type: "lög í heild",
          time: "2026-10-22T15:31:00Z",
          url: "https://www.althingi.is/altext/158/s/0307.html",
          pdf: "https://www.althingi.is/altext/pdf/158/s/0307.pdf",
        },
      ],
    });

    const request = await althingiBill(
      new Request("http://localhost/x/althingi/bills/149"),
      { number: "149" },
    );
    const report = (await request.json()) as {
      status: string | null;
      documents: unknown[];
    };
    assert.isUndefined(validate(althingiBill.health.schema, report));
    assert.isNull(report.status);
    assert.equal(report.documents.length, 1);

    assert.deepEqual(server.requested, [
      LIST_URL,
      detailUrl(3),
      detailUrl(149),
    ]);
  } finally {
    server.restore();
  }
});

test("althingi bill - 404s for an unknown or B issue, 400s for a bad number", async () => {
  const server = mockFetch({ [LIST_URL]: LIST });
  try {
    for (const number of ["999", "131"]) {
      const res = await althingiBill(
        new Request(`http://localhost/x/althingi/bills/${number}`),
        { number },
      );
      assert.equal(res.status, 404, number);
      assert.deepEqual(await res.json(), { error: `Unknown issue ${number}` });
    }
    const res = await althingiBill(
      new Request("http://localhost/x/althingi/bills/abc"),
      { number: "abc" },
    );
    assert.equal(res.status, 400);
    assert.deepEqual(server.requested, [LIST_URL]);
  } finally {
    server.restore();
  }
});

test("althingi bills - throws when Alþingi responds with an error", async () => {
  await expectError({ [LIST_URL]: 503 }, "/x/althingi/bills", "503");
  await expectError(
    { [LIST_URL]: LIST, [detailUrl(3)]: 500 },
    "/x/althingi/bills/3",
    "500",
  );
});

test("althingi bills - throws when the XML layout changes", async () => {
  await expectError(
    { [LIST_URL]: "<issues></issues>" },
    "/x/althingi/bills",
    "not found",
  );
  await expectError(
    { [LIST_URL]: list(BILL.replace("málstegund='l'", "málstegund='x'")) },
    "/x/althingi/bills",
    'Unknown type "x" on issue 3',
  );
  for (const body of [
    "<issue></issue>",
    NOT_FOUND,
    BILL_DETAIL.replace(
      /<þingskjöl>[\s\S]*<\/þingskjöl>/,
      "<þingskjöl></þingskjöl>",
    ),
  ]) {
    await expectError(
      { [LIST_URL]: LIST, [detailUrl(3)]: body },
      "/x/althingi/bills/3",
      "Alþingi issue 3 not found",
    );
  }
  await expectError(
    {
      [LIST_URL]: LIST,
      [detailUrl(3)]: BILL_DETAIL.replace(
        "2026-09-09 19:48",
        "09.09.2026 19:48",
      ),
    },
    "/x/althingi/bills/3",
    'Unexpected time "09.09.2026 19:48" on document 3',
  );
});
