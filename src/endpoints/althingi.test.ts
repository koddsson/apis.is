import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import althingiVotes from "./althingi.ts";

beforeEach(() => {
  clearCache();
});

function vote(
  id: number,
  issue: number,
  category: "A" | "B",
  name: string,
  body: string,
) {
  const path = category === "A" ? "ferill" : "bferill";
  return `<atkvæðagreiðsla  málsnúmer='${issue}' þingnúmer='158'\t\t\tmálsflokkur='${category}' atkvæðagreiðslunúmer='${id}'>
<mál málsnúmer='${issue}' þingnúmer='158' málsflokkur='${category}'>
<málsheiti>${name}</málsheiti><html>https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/${path}/?ltg=158&amp;mnr=${issue}</html>
<xml>https://www.althingi.is/altext/xml/thingmalalisti/thingmal/?lthing=158&amp;malnr=${issue}</xml>
</mál>${body}
</atkvæðagreiðsla>`;
}

function document(number: number) {
  return `<þingskjal skjalsnúmer='${number}' þingnúmer='158'>
<slóð>
<xml>https://www.althingi.is/altext/xml/thingskjol/thingskjal/?lthing=158&amp;skjalnr=${number}</xml>
</slóð>
</þingskjal>`;
}

function details(id: number) {
  return `<nánar>
<html>https://www.althingi.is/dba-bin/atkvgr.pl?nnafnak=${id}</html>
<xml>https://www.althingi.is/altext/xml/atkvaedagreidslur/atkvaedagreidsla/?numer=${id}</xml>
</nánar>`;
}

function summary(
  method: string,
  yes: number,
  no: number,
  abstained: number,
  result: string,
) {
  return `<samantekt><aðferð>${method}</aðferð>
<já><fjöldi>${yes}</fjöldi></já>
<nei><fjöldi>${no}</fjöldi></nei>
<greiðirekkiatkvæði><fjöldi>${abstained}</fjöldi></greiðirekkiatkvæði>
<afgreiðsla>${result}</afgreiðsla>
</samantekt>`;
}

function votes(...entries: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<atkvæðagreiðslur>
<!-- greiðirekkiatkvæði er oft kallað að sitja hjá - þingmaðurinn var í þingsalnum og ýtti á takkann greiðir ekki atkvæði -->
${entries.join("\n")}
</atkvæðagreiðslur>`;
}

const DECLARATION = vote(
  69997,
  100,
  "A",
  "stjórnsýslulög",
  `<tími>2026-10-05T14:54:41</tími>
<fundur>12</fundur>
<tegund tegund='n2'>Frv. gengur</tegund>${document(100)}

<til>stjórnskipunar- og eftirlitsnefnd</til>
<samantekt>
<aðferð>yfirlýsing forseta/mál gengur</aðferð>
</samantekt>`,
);

const ELECTRONIC = vote(
  70007,
  149,
  "A",
  "ójöfnuður, félagslegt landslag og félagslegur hreyfanleiki á Íslandi",
  `<tími>2026-10-07T14:07:38</tími>
<fundur>14</fundur>
<tegund tegund='bn'>Beiðni leyfð</tegund>${document(149)}

<til>forsætisráðherra</til>
${summary("atkvæðagreiðslukerfi", 42, 0, 0, "samþykkt")}
${details(70007)}`,
);

const AMENDMENT = vote(
  70060,
  2,
  "A",
  "breyting á ýmsum lögum vegna fjárlaga 2027",
  `<tími>2026-10-21T15:02:10</tími>
<fundur>22</fundur>
<tegund tegund='bt'>Brtt.</tegund>${document(250)}
<nánar><![CDATA[2 (nýr kafli með nýrri grein)]]></nánar>
${summary("nafnakall", 20, 34, 4, "Fellt")}
${details(70060)}`,
);

const BLANK_ITEM = vote(
  70061,
  2,
  "A",
  "breyting á ýmsum lögum vegna fjárlaga 2027",
  `<tími>2026-10-21T15:02:10</tími>
<fundur>22</fundur>
<tegund tegund='gr'>Þskj.</tegund>${document(250)}
<nánar><![CDATA[ ]]></nánar>
${summary("atkvæðagreiðslukerfi", 43, 0, 0, "samþykkt")}
${details(70061)}`,
);

const AGENDA_MOTION = vote(
  70070,
  456,
  "B",
  "dagskrártillaga",
  `<tími>2026-10-14T13:43:25</tími>
<fundur>18</fundur>
<tegund tegund='ad'>Dagskrártillaga</tegund>
${summary("atkvæðagreiðslukerfi", 19, 29, 0, "Fellt")}
${details(70070)}`,
);

const VOTES = votes(
  DECLARATION,
  ELECTRONIC,
  AMENDMENT,
  BLANK_ITEM,
  AGENDA_MOTION,
);

function mockFetch(body: string, status = 200) {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    requested.push(input.toString());
    return Promise.resolve(new Response(body, { status }));
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

async function expectError(body: string, message: string, status = 200) {
  const server = mockFetch(body, status);
  try {
    await althingiVotes(new Request("http://localhost/x/althingi/votes")).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, message),
    );
  } finally {
    server.restore();
  }
}

test("althingi votes - maps votes newest first", async () => {
  const server = mockFetch(VOTES);
  try {
    const res = await althingiVotes(
      new Request("http://localhost/x/althingi/votes"),
    );
    const data = await res.json();
    assert.isUndefined(validate(althingiVotes.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=1800");
    assert.deepEqual(server.requested, [
      "https://www.althingi.is/altext/xml/atkvaedagreidslur/?dagar=30",
    ]);
    assert.deepEqual(data, [
      {
        id: 70061,
        session: 158,
        meeting: 22,
        time: "2026-10-21T15:02:10Z",
        issue: {
          number: 2,
          category: "A",
          name: "breyting á ýmsum lögum vegna fjárlaga 2027",
          url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=2",
        },
        document: 250,
        type: "Þskj.",
        typeCode: "gr",
        item: null,
        referredTo: null,
        method: "electronic",
        yes: 43,
        no: 0,
        abstained: 0,
        result: "passed",
        url: "https://www.althingi.is/dba-bin/atkvgr.pl?nnafnak=70061",
      },
      {
        id: 70060,
        session: 158,
        meeting: 22,
        time: "2026-10-21T15:02:10Z",
        issue: {
          number: 2,
          category: "A",
          name: "breyting á ýmsum lögum vegna fjárlaga 2027",
          url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=2",
        },
        document: 250,
        type: "Brtt.",
        typeCode: "bt",
        item: "2 (nýr kafli með nýrri grein)",
        referredTo: null,
        method: "rollCall",
        yes: 20,
        no: 34,
        abstained: 4,
        result: "rejected",
        url: "https://www.althingi.is/dba-bin/atkvgr.pl?nnafnak=70060",
      },
      {
        id: 70070,
        session: 158,
        meeting: 18,
        time: "2026-10-14T13:43:25Z",
        issue: {
          number: 456,
          category: "B",
          name: "dagskrártillaga",
          url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/bferill/?ltg=158&mnr=456",
        },
        document: null,
        type: "Dagskrártillaga",
        typeCode: "ad",
        item: null,
        referredTo: null,
        method: "electronic",
        yes: 19,
        no: 29,
        abstained: 0,
        result: "rejected",
        url: "https://www.althingi.is/dba-bin/atkvgr.pl?nnafnak=70070",
      },
      {
        id: 70007,
        session: 158,
        meeting: 14,
        time: "2026-10-07T14:07:38Z",
        issue: {
          number: 149,
          category: "A",
          name: "ójöfnuður, félagslegt landslag og félagslegur hreyfanleiki á Íslandi",
          url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=149",
        },
        document: 149,
        type: "Beiðni leyfð",
        typeCode: "bn",
        item: null,
        referredTo: "forsætisráðherra",
        method: "electronic",
        yes: 42,
        no: 0,
        abstained: 0,
        result: "passed",
        url: "https://www.althingi.is/dba-bin/atkvgr.pl?nnafnak=70007",
      },
      {
        id: 69997,
        session: 158,
        meeting: 12,
        time: "2026-10-05T14:54:41Z",
        issue: {
          number: 100,
          category: "A",
          name: "stjórnsýslulög",
          url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=100",
        },
        document: 100,
        type: "Frv. gengur",
        typeCode: "n2",
        item: null,
        referredTo: "stjórnskipunar- og eftirlitsnefnd",
        method: "declaration",
        yes: null,
        no: null,
        abstained: null,
        result: null,
        url: null,
      },
    ]);
  } finally {
    server.restore();
  }
});

test("althingi votes - filters by issue and caches per days window", async () => {
  const server = mockFetch(VOTES);
  try {
    const res = await althingiVotes(
      new Request(
        "http://localhost/x/althingi/votes?days=7&issue=2&pretty=true",
      ),
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((v: { id: number }) => v.id),
      [70061, 70060],
    );

    const none = await althingiVotes(
      new Request("http://localhost/x/althingi/votes?days=7&issue=999"),
    );
    assert.deepEqual(await none.json(), []);
    await althingiVotes(new Request("http://localhost/x/althingi/votes"));

    assert.deepEqual(server.requested, [
      "https://www.althingi.is/altext/xml/atkvaedagreidslur/?dagar=7",
      "https://www.althingi.is/altext/xml/atkvaedagreidslur/?dagar=30",
    ]);
  } finally {
    server.restore();
  }
});

test("althingi votes - rejects invalid query params", async () => {
  const server = mockFetch(VOTES);
  try {
    for (const query of ["days=0", "days=91", "days=1.5", "days=", "issue=x"]) {
      const res = await althingiVotes(
        new Request(`http://localhost/x/althingi/votes?${query}`),
      );
      assert.equal(res.status, 400, query);
    }
    assert.equal(server.requested.length, 0);
  } finally {
    server.restore();
  }
});

test("althingi votes - returns an empty list during recess", async () => {
  const server = mockFetch(votes());
  try {
    const res = await althingiVotes(
      new Request("http://localhost/x/althingi/votes"),
    );
    const data = await res.json();
    assert.deepEqual(data, []);
    assert.isUndefined(validate(althingiVotes.health.schema, data));
  } finally {
    server.restore();
  }
});

test("althingi votes - throws when Alþingi responds with an error", async () => {
  await expectError("", "503", 503);
});

test("althingi votes - throws when the XML layout changes", async () => {
  await expectError("<votes></votes>", "not found");
  await expectError(
    votes(ELECTRONIC.replace("atkvæðagreiðslukerfi", "rafrænt")),
    'Unknown method "rafrænt" on vote 70007',
  );
  await expectError(
    votes(ELECTRONIC.replace("samþykkt", "frestað")),
    'Unknown result "frestað" on vote 70007',
  );
  await expectError(
    votes(ELECTRONIC.replace("2026-10-07T14:07:38", "07.10.2026 14:07")),
    'Unexpected time "07.10.2026 14:07" on vote 70007',
  );
});
