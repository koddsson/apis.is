import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import althingiAgenda from "./althingi-agenda.ts";

beforeEach(() => {
  clearCache();
});

const XML_URL = "https://www.althingi.is/altext/xml/";
const NEXT_URL = `${XML_URL}dagskra/thingfundur/`;
const SESSION_URL = `${XML_URL}loggjafarthing/yfirstandandi/`;
const MEETING_URL = `${NEXT_URL}?lthing=158&fundur=23`;

const SESSION = `<?xml version="1.0" encoding="UTF-8"?>
<löggjafarþing>
	<þing númer='158'>
		<þingsetning>08.09.2026</þingsetning>
		<yfirlit>
			<þingmálalisti>http://www.althingi.is/altext/xml/thingmalalisti/?lthing=158</þingmálalisti>
		</yfirlit>
	</þing>
</löggjafarþing>`;

function item(
  number: number,
  issue: number,
  category: "A" | "B",
  body: string,
  debate: string,
) {
  const path = category === "A" ? "ferill" : "bferill";
  return `<dagskrárliður númer='${number}'>
<mál málsnúmer='${issue}' þingnúmer='158' málsflokkur='${category}'>
${body}
<html>http://http://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/${path}/?ltg=158&amp;mnr=${issue}</html>
<xml>http://www.althingi.is/altext/xml/thingmalalisti/thingmal/?lthing=158&amp;malnr=${issue}</xml>
<rss></rss>
</mál>${debate}</dagskrárliður>`;
}

const QUESTION_TIME = item(
  1,
  124,
  "B",
  `<málsheiti>óundirbúinn fyrirspurnatími</málsheiti>
<málstegund id='ft'>óundirbúinn fyrirspurnatími</málstegund>
<fyrirspyrjandi id=''></fyrirspyrjandi>
<til_svara id=''></til_svara>`,
  "<umræða tegund='*' framhald=''> </umræða>",
);

const SPECIAL_DEBATE = item(
  2,
  131,
  "B",
  `<málsheiti>Lyfjagjöf á hjúkrunarheimilum og umönnun aldraðra</málsheiti>
<málstegund id='um'>sérstök umræða</málstegund>
<málshefjandi id='1516'>Halla Hrund Logadóttir</málshefjandi>
<til_andsvara id='1510'>heilbrigðisráðherra</til_andsvara>`,
  "<umræða tegund='*' framhald=''> </umræða>",
);

const SECOND_DEBATE = item(
  3,
  3,
  "A",
  `<málsheiti>menningarminjar og mannvirki</málsheiti>
<efnisgreining>álit Minjastofnunar Íslands vegna húsa og mannvirkja</efnisgreining><málstegund id='l'>Frumvarp til laga</málstegund>`,
  `<umræða tegund='2' framhald=''> 2. umræða</umræða>	<athugasemd tegund='A'>
				<dagskrártexti>atkvæðagreiðsla</dagskrártexti>
				<skýring>(Atkvæðagreiðsla).</skýring>
	</athugasemd>`,
);

const CONTINUED_DEBATE = item(
  4,
  1,
  "A",
  `<málsheiti>fjárlög 2027</málsheiti>
<málstegund id='l'>Frumvarp til laga</málstegund>`,
  "<umræða tegund='1' framhald='1'>framhald 1. umræðu</umræða>",
);

const ORAL_QUESTION = item(
  1,
  245,
  "A",
  `<málsheiti>notkun ólöglegra peptíða meðal barna og ungmenna</málsheiti>
<málstegund id='m'>Fyrirspurn</málstegund>
<fyrirspyrjandi id='1525'>Sigurður Helgi Pálmason</fyrirspyrjandi>
<til_svara id='1510'>heilbrigðisráðherra</til_svara>`,
  "<umræða tegund='*' framhald=''> </umræða>",
);

function agenda(meeting: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><dagskráþingfundar>
${meeting}
</dagskráþingfundar>`;
}

const NEXT = agenda(`<þingfundur númer='22' þingnúmer='158'>
<fundarheiti>22. fundur</fundarheiti>
<hefst>
<texti>22. október, kl. 1:30 árdegis</texti>
<dagur>22.10.2026</dagur>
<timi>13:30</timi>
<dagurtími>2026-10-22T13:30:00</dagurtími>
</hefst>
<dagskrá>
${QUESTION_TIME}
${SPECIAL_DEBATE}
${SECOND_DEBATE}
${CONTINUED_DEBATE}
</dagskrá>
</þingfundur>`);

const MEETING = agenda(`<þingfundur númer='23' þingnúmer='158'>
<fundarheiti>23. fundur</fundarheiti>
<hefst><texti>að loknum 22. fundi</texti></hefst><fundursettur>2026-10-22T14:56:26</fundursettur>
<fuslit>2026-10-22T15:53:27</fuslit>
<dagskrá>
${ORAL_QUESTION}
</dagskrá>
</þingfundur>`);

const EMPTY = `<?xml version="1.0" encoding="UTF-8"?><dagskráþingfundar>
</dagskráþingfundar>`;

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

async function expectError(
  routes: Record<string, string | number>,
  query: string,
  message: string,
) {
  const server = mockFetch(routes);
  try {
    await althingiAgenda(
      new Request(`http://localhost/x/althingi/agenda${query}`),
    ).then(
      () => assert.fail("expected an error"),
      (error: Error) => assert.include(error.message, message),
    );
  } finally {
    server.restore();
  }
}

test("althingi agenda - maps the next sitting's agenda", async () => {
  const server = mockFetch({ [NEXT_URL]: NEXT });
  try {
    const res = await althingiAgenda(
      new Request("http://localhost/x/althingi/agenda"),
    );
    const data = await res.json();
    assert.isUndefined(validate(althingiAgenda.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=1800");
    assert.deepEqual(data, {
      session: 158,
      meeting: 22,
      name: "22. fundur",
      time: "2026-10-22T13:30:00Z",
      timeText: "22. október, kl. 1:30 árdegis",
      start: null,
      end: null,
      items: [
        {
          number: 1,
          issue: {
            number: 124,
            category: "B",
            name: "óundirbúinn fyrirspurnatími",
            description: null,
            type: "óundirbúinn fyrirspurnatími",
            typeCode: "ft",
            url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/bferill/?ltg=158&mnr=124",
          },
          debate: null,
          speaker: null,
          respondent: null,
          note: null,
        },
        {
          number: 2,
          issue: {
            number: 131,
            category: "B",
            name: "Lyfjagjöf á hjúkrunarheimilum og umönnun aldraðra",
            description: null,
            type: "sérstök umræða",
            typeCode: "um",
            url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/bferill/?ltg=158&mnr=131",
          },
          debate: null,
          speaker: "Halla Hrund Logadóttir",
          respondent: "heilbrigðisráðherra",
          note: null,
        },
        {
          number: 3,
          issue: {
            number: 3,
            category: "A",
            name: "menningarminjar og mannvirki",
            description: "álit Minjastofnunar Íslands vegna húsa og mannvirkja",
            type: "Frumvarp til laga",
            typeCode: "l",
            url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=3",
          },
          debate: "2. umræða",
          speaker: null,
          respondent: null,
          note: "(Atkvæðagreiðsla).",
        },
        {
          number: 4,
          issue: {
            number: 1,
            category: "A",
            name: "fjárlög 2027",
            description: null,
            type: "Frumvarp til laga",
            typeCode: "l",
            url: "https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=158&mnr=1",
          },
          debate: "framhald 1. umræðu",
          speaker: null,
          respondent: null,
          note: null,
        },
      ],
    });
    assert.deepEqual(server.requested, [NEXT_URL]);
  } finally {
    server.restore();
  }
});

test("althingi agenda - fetches a meeting of the current session", async () => {
  const server = mockFetch({ [SESSION_URL]: SESSION, [MEETING_URL]: MEETING });
  try {
    const res = await althingiAgenda(
      new Request("http://localhost/x/althingi/agenda?meeting=23&pretty=true"),
    );
    const text = await res.text();
    assert.include(text, "\n");
    const data = JSON.parse(text);
    assert.isUndefined(validate(althingiAgenda.health.schema, data));
    assert.deepInclude(data, {
      meeting: 23,
      time: null,
      timeText: "að loknum 22. fundi",
      start: "2026-10-22T14:56:26Z",
      end: "2026-10-22T15:53:27Z",
    });
    assert.deepInclude(data.items[0], {
      speaker: "Sigurður Helgi Pálmason",
      respondent: "heilbrigðisráðherra",
    });
    assert.deepEqual(server.requested, [SESSION_URL, MEETING_URL]);
  } finally {
    server.restore();
  }
});

test("althingi agenda - returns null when no sitting is scheduled", async () => {
  const server = mockFetch({ [NEXT_URL]: EMPTY });
  try {
    const res = await althingiAgenda(
      new Request("http://localhost/x/althingi/agenda"),
    );
    const data = await res.json();
    assert.isNull(data);
    assert.isUndefined(validate(althingiAgenda.health.schema, data));
  } finally {
    server.restore();
  }
});

test("althingi agenda - keeps a sitting with an empty agenda", async () => {
  const server = mockFetch({
    [NEXT_URL]: NEXT.replace(
      /<dagskrá>[\s\S]*<\/dagskrá>/,
      "<dagskrá>\n</dagskrá>",
    ),
  });
  try {
    const res = await althingiAgenda(
      new Request("http://localhost/x/althingi/agenda"),
    );
    const data = (await res.json()) as { items: unknown[] };
    assert.deepEqual(data.items, []);
  } finally {
    server.restore();
  }
});

test("althingi agenda - 404s for an unknown meeting, 400s for a bad one", async () => {
  const server = mockFetch({
    [SESSION_URL]: SESSION,
    [`${NEXT_URL}?lthing=158&fundur=999`]: EMPTY,
  });
  try {
    const res = await althingiAgenda(
      new Request("http://localhost/x/althingi/agenda?meeting=999"),
    );
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "Unknown meeting 999" });
    for (const meeting of ["0", "abc", "1.5", ""]) {
      const bad = await althingiAgenda(
        new Request(`http://localhost/x/althingi/agenda?meeting=${meeting}`),
      );
      assert.equal(bad.status, 400, meeting);
    }
    assert.equal(server.requested.length, 2);
  } finally {
    server.restore();
  }
});

test("althingi agenda - throws when Alþingi responds with an error", async () => {
  await expectError({ [NEXT_URL]: 503 }, "", "503");
  await expectError({ [SESSION_URL]: 500 }, "?meeting=23", "500");
});

test("althingi agenda - throws when the XML layout changes", async () => {
  await expectError({ [NEXT_URL]: "<agenda></agenda>" }, "", "not found");
  await expectError(
    { [SESSION_URL]: "<session></session>" },
    "?meeting=23",
    "Current Alþingi session not found",
  );
  await expectError(
    { [NEXT_URL]: NEXT.replace("2026-10-22T13:30:00", "22.10.2026 13:30") },
    "",
    'Unexpected time "22.10.2026 13:30" on meeting 22',
  );
});
