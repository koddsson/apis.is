import { assert, test } from "vitest";
import nova2f1 from "./nova-2f1.ts";

type Offer = {
  name: string;
  description: string;
  image: string;
  address: string;
  days: string[];
  link: string;
};

// Upstream days are ordered Sunday first.
const mockOffers = [
  {
    name: "Vök Baths",
    handle: "voek-baths",
    description: "Fljótandi laugar á Urriðavatni.",
    imageUrl: "https://images.ctfassets.net/example/voek.jpg",
    days: [false, true, true, false, false, false, false],
    locations: [{ streetAddress: null }, { streetAddress: "Vök, Egilsstaðir" }],
  },
  {
    name: "Sunday only",
    handle: "sunday-only",
    description: null,
    imageUrl: null,
    days: [true, false, false, false, false, false, false],
    locations: [],
  },
];

function mockFetch(body: unknown, status = 200) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: input.toString(), init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return requests;
}

test("nova2f1 - maps offers from Nova's GraphQL API", async () => {
  const originalFetch = globalThis.fetch;
  const requests = mockFetch({
    data: { twoForOne: { twoForOne: mockOffers } },
  });

  try {
    const res = await nova2f1(new Request("http://localhost/x/nova-2f1"));

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(requests[0].url, "https://graphql.nova.is/graphql");
    assert.equal(requests[0].init?.method, "POST");
    const body = JSON.parse(requests[0].init?.body as string);
    assert.deepEqual(body.variables, {
      input: { filter: {}, pageSize: 200 },
    });

    const data = await res.json<Offer[]>();
    assert.deepEqual(data, [
      {
        name: "Vök Baths",
        description: "Fljótandi laugar á Urriðavatni.",
        image: "https://images.ctfassets.net/example/voek.jpg",
        address: "Vök, Egilsstaðir",
        days: ["Mán", "Þri"],
        link: "https://www.nova.is/dansgolfid/fyrir-thig/2f1/voek-baths",
      },
      {
        name: "Sunday only",
        description: "",
        image: "",
        address: "",
        days: ["Sun"],
        link: "https://www.nova.is/dansgolfid/fyrir-thig/2f1/sunday-only",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("nova2f1 - returns pretty JSON when pretty=true", async () => {
  const originalFetch = globalThis.fetch;
  mockFetch({ data: { twoForOne: { twoForOne: mockOffers } } });

  try {
    const compact = await nova2f1(new Request("http://localhost/x/nova-2f1"));
    assert.isFalse((await compact.text()).includes("\n"));

    const pretty = await nova2f1(
      new Request("http://localhost/x/nova-2f1?pretty=true"),
    );
    assert.isTrue((await pretty.text()).includes("\n"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("nova2f1 - throws when the API responds with an error status", async () => {
  const originalFetch = globalThis.fetch;
  mockFetch({}, 503);

  try {
    let thrown: unknown;
    try {
      await nova2f1(new Request("http://localhost/x/nova-2f1"));
    } catch (error) {
      thrown = error;
    }
    assert.instanceOf(thrown, Error);
    assert.equal((thrown as Error).message, "Failed to fetch offers: 503");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("nova2f1 - throws on GraphQL errors", async () => {
  const originalFetch = globalThis.fetch;
  mockFetch({ errors: [{ message: "Cannot query field" }] });

  try {
    let thrown: unknown;
    try {
      await nova2f1(new Request("http://localhost/x/nova-2f1"));
    } catch (error) {
      thrown = error;
    }
    assert.instanceOf(thrown, Error);
    assert.equal(
      (thrown as Error).message,
      "Nova GraphQL error: Cannot query field",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("nova2f1 - has correct meta information", () => {
  assert.deepEqual(nova2f1.meta?.endpoint, "/x/nova-2f1");
  assert.include(nova2f1.meta?.description || "", "2-for-1");
});
