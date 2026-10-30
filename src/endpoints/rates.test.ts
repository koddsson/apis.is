import { assert, beforeEach, test } from "vitest";
import { clearCache } from "../cache.ts";
import { validate } from "../health.ts";
import { feed, serveGroups } from "../sedlabanki.test-helper.ts";
import rates, { current } from "./rates.ts";

beforeEach(() => {
  clearCache();
});

function steady(value: number): Array<[string, number]> {
  return [
    ["2026-10-29", value],
    ["2026-10-30", value],
  ];
}

const CENTRAL_BANK = feed({
  "17923": [
    ["2026-08-18", 8.25],
    ["2026-08-19", 8],
    ["2026-10-30", 8],
  ],
  "55": steady(8.75),
  "24": steady(9.75),
  "28": steady(7.75),
  "23": [],
});

const PENALTY = feed({
  "22": [
    ["2026-08-01", 15.5],
    ["2026-09-01", 15.75],
    ["2026-10-01", 15.75],
  ],
});

const INTERBANK = feed(
  Object.fromEntries(
    [
      ["12", 7.888],
      ["3", 7.613],
      ["3171", 7.888],
      ["3170", 7.613],
      ["17", 8.013],
      ["8", 7.7],
      ["20", 8.063],
      ["11", 7.75],
      ["13", 8.213],
      ["4", 7.813],
      ["14", 8.325],
      ["5", 7.825],
      ["15", 8.338],
      ["6", 7.838],
      ["16", 8.338],
      ["7", 7.838],
    ].map(([id, value]): [string, Array<[string, number]>] => [
      String(id),
      [
        ["2026-10-29", 0],
        ["2026-10-30", Number(value)],
      ],
    ]),
  ),
);

type Rates = {
  centralBank: Array<{
    id: string;
    name: string;
    rate: number;
    since: string | null;
  }>;
  penaltyInterest: { rate: number; since: string | null };
  interbank: {
    date: string;
    terms: Array<{ term: string; reibor: number; reibid: number }>;
  };
  source: string;
};

test("rates - returns central bank, penalty and interbank rates", async () => {
  const server = serveGroups({ 1: CENTRAL_BANK, 2: PENALTY, 4: INTERBANK });
  try {
    const res = await rates(new Request("http://localhost/x/rates"));
    assert.isUndefined(validate(rates.health.schema, await res.clone().json()));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=10800");

    const data = await res.json<Rates>();
    assert.deepEqual(data.centralBank[0], {
      id: "policy-rate",
      name: "Policy rate (7-day term deposits)",
      rate: 8,
      since: "2026-08-19",
    });
    assert.deepEqual(
      data.centralBank.map(({ id, rate }) => [id, rate]),
      [
        ["policy-rate", 8],
        ["collateralised-lending", 8.75],
        ["overnight-lending", 9.75],
        ["current-account", 7.75],
      ],
    );
    assert.deepEqual(data.penaltyInterest, {
      rate: 15.75,
      since: "2026-09-01",
    });
    assert.equal(data.interbank.date, "2026-10-30");
    assert.deepEqual(data.interbank.terms[0], {
      term: "overnight",
      reibor: 7.888,
      reibid: 7.613,
    });
    assert.deepEqual(data.interbank.terms.at(-1), {
      term: "6-months",
      reibor: 8.338,
      reibid: 7.838,
    });
    assert.equal(data.source, "Seðlabanki Íslands");
    assert.lengthOf(server.urls, 3);
  } finally {
    server.restore();
  }
});

test("rates - supports pretty output and caches upstream data", async () => {
  const server = serveGroups({ 1: CENTRAL_BANK, 2: PENALTY, 4: INTERBANK });
  try {
    await rates(new Request("http://localhost/x/rates"));
    const res = await rates(
      new Request("http://localhost/x/rates?pretty=true"),
    );
    assert.include(await res.text(), '\n  "centralBank"');
    assert.lengthOf(server.urls, 3);
  } finally {
    server.restore();
  }
});

test("rates - fails when a series is missing", async () => {
  const server = serveGroups({
    1: CENTRAL_BANK,
    2: feed({ "22": [] }),
    4: INTERBANK,
  });
  try {
    await rates(new Request("http://localhost/x/rates")).then(
      () => assert.fail("expected an error"),
      (error: Error) =>
        assert.equal(error.message, "No data for Seðlabanki series 22"),
    );
  } finally {
    server.restore();
  }
});

test("current - has no start date for a rate unchanged throughout", () => {
  assert.deepEqual(current([{ date: "2026-10-30", value: 8 }]), {
    rate: 8,
    since: null,
  });
  assert.deepEqual(
    current([
      { date: "2026-10-29", value: 8 },
      { date: "2026-10-30", value: 8 },
    ]),
    { rate: 8, since: null },
  );
});
