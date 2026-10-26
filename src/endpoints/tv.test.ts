import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import tv from "./tv.ts";

beforeEach(() => {
  clearCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function ruvEvent(event: Record<string, unknown>) {
  return {
    id: 5462848,
    original_title: null,
    description: [],
    rating: 0,
    episode_number: null,
    number_of_episodes: null,
    is_header: false,
    is_subevent: false,
    is_live: false,
    is_rerun: false,
    ...event,
  };
}

const RUV = {
  channel: "ruv",
  title: "Dagskrá RÚV",
  selected_date: "Mon 26/10",
  selected_iso: "2026-10-26T00:00:00",
  events: [
    ruvEvent({
      start_time: "2026-10-26T19:46:09.280000",
      end_time: "2026-10-26T20:11:09.280000",
      title: "Kastljós",
      description: ["Fréttaskýringaþáttur.", null],
      is_live: true,
    }),
    ruvEvent({
      start_time: "2026-10-26T17:30:12.080000",
      end_time: "2026-10-26T18:20:06.080000",
      title: "KrakkaRÚV",
      description: null,
    }),
    ruvEvent({
      start_time: "2026-10-26T17:30:22.080000",
      end_time: "2026-10-26T17:33:27.080000",
      title: "Sandkassinn",
      is_subevent: true,
    }),
    ruvEvent({
      start_time: "2026-10-26T21:07:17",
      end_time: "2026-10-26T21:54:11",
      title: "Frá París til Istanbúl með Sue Perkins",
      original_title: "Paris to Istanbul with Sue Perkins",
      description: [
        "Sue Perkins ferðast frá París til Istanbúl.",
        "Fyrsti þáttur.",
      ],
      episode_number: 1,
      number_of_episodes: 3,
    }),
    ruvEvent({
      start_time: "2026-10-26T00:00:00",
      end_time: "2026-10-26T00:00:00",
      title: "Mánudagur",
      is_header: true,
    }),
  ],
};

function synProgram(program: Record<string, unknown>) {
  return {
    midill: "SYN",
    midill_heiti: "Sýn",
    dagsetning: "2026-10-26T00:00:00Z",
    undirtitill: program.titill,
    seria: 2026,
    thattur: 0,
    thattafjoldi: 0,
    birta_thatt: 0,
    opin: 0,
    beint: 0,
    frumsyning: 0,
    framundan_i_beinni: 0,
    tegund: null,
    flokkur: "",
    bannad: "Green",
    frelsi: 0,
    netdagar: 0,
    lysing: "",
    ...program,
  };
}

const SYN = [
  synProgram({
    upphaf: "2026-10-26T06:45:00Z",
    titill: "Bítið",
    isltitill: "Bítið",
    thattur: 186,
    thattafjoldi: 250,
    birta_thatt: 1,
    beint: 1,
    flokkur: "Talk-show",
    lysing: "Bylgjan vaknar eldsnemma með hlustendum alla virka morgna. ",
    slott: 195,
    slotlengd: "03:15",
  }),
  synProgram({
    upphaf: "2026-10-26T21:20:00Z",
    titill: "Nexus",
    isltitill: "NCIS",
    thattur: 20,
    thattafjoldi: 0,
    birta_thatt: 1,
    flokkur: "Crime,Drama,Action",
    lysing: null,
    slott: 45,
    slotlengd: "00:45",
  }),
  synProgram({
    upphaf: "2026-10-27T00:10:00Z",
    titill: "The Hustle",
    isltitill: "The Hustle",
    flokkur: "Comedy,Crime",
    lysing: "Tvær svikakvendi.",
    slott: 100,
    slotlengd: "01:40",
  }),
  synProgram({
    dagsetning: "2026-10-27T00:00:00Z",
    upphaf: "2026-10-27T06:45:00Z",
    titill: "Bítið",
    isltitill: "Bítið",
    slott: 195,
  }),
];

const CHELSEA = synProgram({
  midill: "SYNSPORT",
  midill_heiti: "Sýn Sport",
  upphaf: "2026-10-26T12:10:00Z",
  titill: "Premier League",
  isltitill: "Chelsea - Man. Utd.",
  thattur: 84,
  thattafjoldi: 382,
  birta_thatt: 1,
  beint: 1,
  flokkur: "Football,Sport",
  lysing: "Bein útsending frá leik Chelsea og Man. Utd.",
  slott: 150,
});

const SYNSPORT = [
  synProgram({
    midill: "SYNSPORT",
    midill_heiti: "Sýn Sport",
    upphaf: "2026-10-26T06:50:00Z",
    titill: "Premier League Review",
    isltitill: "Premier League Review",
    lysing: "Farið yfir helgina.",
    slott: 50,
  }),
  CHELSEA,
];

const BEINT = [
  CHELSEA,
  synProgram({
    midill: "AP_KKITV_001_PROD",
    midill_heiti: "KKÍ TV 1",
    upphaf: "2026-10-26T18:40:00Z",
    titill: "12. flokkur karla",
    isltitill: "ÍR/Léttir 12.fl.kk. - Fjölnir 12.fl.kk.",
    thattur: 1,
    thattafjoldi: 1,
    birta_thatt: 1,
    beint: 1,
    flokkur: "Basketball",
    lysing: "Bein útsending.",
    slott: 125,
  }),
];

function mockFetch(
  bodies: Record<string, unknown> = {
    "ruv/": RUV,
    "ruv2/": { channel: "ruv2", events: [] },
    "syn/": SYN,
    "synsport/": SYNSPORT,
    "beint/": BEINT,
  },
  status = 200,
) {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = input.toString();
    requested.push(url);
    const key = Object.keys(bodies).find((path) => url.includes(`/${path}`));
    return Promise.resolve(
      new Response(JSON.stringify(key ? bodies[key] : []), { status }),
    );
  };
  return { requested, restore: () => (globalThis.fetch = originalFetch) };
}

test("tv - combines RÚV and Sýn schedules for a day", async () => {
  const server = mockFetch();
  try {
    const res = await tv(new Request("http://localhost/x/tv?date=2026-10-26"));
    const data = await res.json();
    assert.isUndefined(validate(tv.health.schema, data));
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=900");
    assert.sameMembers(server.requested, [
      "https://api.ruv.is/api/schedule/ruv/2026-10-26",
      "https://api.ruv.is/api/schedule/ruv2/2026-10-26",
      "https://www.syn.is/api/epg/syn/2026-10-26",
      "https://www.syn.is/api/epg/synsport/2026-10-26",
      "https://www.syn.is/api/epg/beint/2026-10-26",
    ]);
    assert.deepEqual(data, [
      {
        id: "ruv",
        name: "RÚV",
        broadcaster: "RÚV",
        programs: [
          {
            title: "KrakkaRÚV",
            subtitle: null,
            description: null,
            category: null,
            start: "2026-10-26T17:30:12.000Z",
            end: "2026-10-26T18:20:06.000Z",
            live: false,
            episode: null,
            episodes: null,
          },
          {
            title: "Kastljós",
            subtitle: null,
            description: "Fréttaskýringaþáttur.",
            category: null,
            start: "2026-10-26T19:46:09.000Z",
            end: "2026-10-26T20:11:09.000Z",
            live: true,
            episode: null,
            episodes: null,
          },
          {
            title: "Frá París til Istanbúl með Sue Perkins",
            subtitle: "Paris to Istanbul with Sue Perkins",
            description:
              "Sue Perkins ferðast frá París til Istanbúl.\nFyrsti þáttur.",
            category: null,
            start: "2026-10-26T21:07:17.000Z",
            end: "2026-10-26T21:54:11.000Z",
            live: false,
            episode: 1,
            episodes: 3,
          },
        ],
      },
      {
        id: "syn",
        name: "Sýn",
        broadcaster: "Sýn",
        programs: [
          {
            title: "Bítið",
            subtitle: null,
            description:
              "Bylgjan vaknar eldsnemma með hlustendum alla virka morgna.",
            category: "Talk-show",
            start: "2026-10-26T06:45:00.000Z",
            end: "2026-10-26T10:00:00.000Z",
            live: true,
            episode: 186,
            episodes: 250,
          },
          {
            title: "NCIS",
            subtitle: "Nexus",
            description: null,
            category: "Crime,Drama,Action",
            start: "2026-10-26T21:20:00.000Z",
            end: "2026-10-26T22:05:00.000Z",
            live: false,
            episode: 20,
            episodes: null,
          },
          {
            title: "The Hustle",
            subtitle: null,
            description: "Tvær svikakvendi.",
            category: "Comedy,Crime",
            start: "2026-10-27T00:10:00.000Z",
            end: "2026-10-27T01:50:00.000Z",
            live: false,
            episode: null,
            episodes: null,
          },
        ],
      },
      {
        id: "synsport",
        name: "Sýn Sport",
        broadcaster: "Sýn",
        programs: [
          {
            title: "Premier League Review",
            subtitle: null,
            description: "Farið yfir helgina.",
            category: null,
            start: "2026-10-26T06:50:00.000Z",
            end: "2026-10-26T07:40:00.000Z",
            live: false,
            episode: null,
            episodes: null,
          },
          {
            title: "Chelsea - Man. Utd.",
            subtitle: "Premier League",
            description: "Bein útsending frá leik Chelsea og Man. Utd.",
            category: "Football,Sport",
            start: "2026-10-26T12:10:00.000Z",
            end: "2026-10-26T14:40:00.000Z",
            live: true,
            episode: 84,
            episodes: 382,
          },
        ],
      },
      {
        id: "kkitv1",
        name: "KKÍ TV 1",
        broadcaster: "Sýn",
        programs: [
          {
            title: "ÍR/Léttir 12.fl.kk. - Fjölnir 12.fl.kk.",
            subtitle: "12. flokkur karla",
            description: "Bein útsending.",
            category: "Basketball",
            start: "2026-10-26T18:40:00.000Z",
            end: "2026-10-26T20:45:00.000Z",
            live: true,
            episode: 1,
            episodes: 1,
          },
        ],
      },
    ]);
  } finally {
    server.restore();
  }
});

test("tv - defaults to today and filters by channel", async () => {
  const server = mockFetch();
  try {
    const res = await tv(
      new Request("http://localhost/x/tv?channel=KKITV1&pretty=true"),
    );
    const text = await res.text();
    assert.include(text, "\n");
    assert.deepEqual(
      JSON.parse(text).map((channel: { id: string }) => channel.id),
      ["kkitv1"],
    );
    assert.include(server.requested[0], "/2026-10-26");

    const ruv2 = await tv(new Request("http://localhost/x/tv?channel=ruv2"));
    assert.equal(ruv2.status, 404);
    assert.deepEqual(await ruv2.json(), {
      error: "No schedule for channel ruv2 on 2026-10-26",
    });
    assert.equal(server.requested.length, 5);
  } finally {
    server.restore();
  }
});

test("tv - rejects invalid dates", async () => {
  const server = mockFetch();
  try {
    for (const date of ["tomorrow", "2026-13-01", "2026-02-30"]) {
      const res = await tv(new Request(`http://localhost/x/tv?date=${date}`));
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "date must be YYYY-MM-DD" });
    }
    for (const date of ["2026-09-13", "2026-12-08"]) {
      const res = await tv(new Request(`http://localhost/x/tv?date=${date}`));
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), {
        error: "date must be within 42 days of today",
      });
    }
    assert.equal(server.requested.length, 0);
  } finally {
    server.restore();
  }
});

test("tv - throws when an upstream responds with an error", async () => {
  for (const source of ["RÚV", "Sýn"]) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: string | URL | Request) => {
      const failing = source === "RÚV" ? "ruv.is" : "syn.is";
      const status = input.toString().includes(failing) ? 504 : 200;
      const body = input.toString().includes("ruv.is") ? RUV : [];
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    };
    try {
      await tv(new Request("http://localhost/x/tv?date=2026-10-26")).then(
        () => assert.fail("expected an error"),
        (error: Error) => assert.include(error.message, `${source}`),
      );
    } finally {
      globalThis.fetch = originalFetch;
      clearCache();
    }
  }
});

test("tv - throws when an upstream changes format", async () => {
  for (const [bodies, message] of [
    [{ "ruv/": {}, "ruv2/": RUV }, "RÚV schedule has no events"],
    [{ "ruv/": RUV, "ruv2/": RUV, "syn/": {} }, "Unexpected Sýn syn"],
  ] as const) {
    const server = mockFetch(bodies);
    try {
      await tv(new Request("http://localhost/x/tv?date=2026-10-26")).then(
        () => assert.fail("expected an error"),
        (error: Error) => assert.include(error.message, message),
      );
    } finally {
      server.restore();
      clearCache();
    }
  }
});

test("tv - health schema rejects an empty schedule", () => {
  assert.isDefined(validate(tv.health.schema, []));
});
