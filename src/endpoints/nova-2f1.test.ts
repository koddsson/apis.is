import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import nova2f1 from "./nova-2f1.ts";

// The real Nova site renders all 7 days for every offer, using different CSS
// classes on the day's parent div to mark active vs inactive days.  "bg-active"
// and "bg-inactive" stand in for the obfuscated atomic-CSS class names.
const mockCss =
  `.bg-active { background-color: #FE3C72; } .bg-inactive { background-color: #E0E0E0; } .shared { padding: 4px; }`;

const mockHtml = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/client/test.css"/>
</head><body>
<div class="as3s0o0">
  <div>
    <div>
      <div>
        <img src="https://images.ctfassets.net/example/image1.png" alt="Test Offer" style="aspect-ratio:16/9;object-fit:cover"/>
      </div>
      <div>
        <h4>Test Offer</h4>
        <div><div><p><strong>2f1 Buy one get one free.</strong> Great food!</p></div></div>
        <div>
          <div>
            <div><div class="bg-active shared"><span>Mán</span></div></div>
            <div><div class="bg-active shared"><span>Þri</span></div></div>
            <div><div class="bg-active shared"><span>Mið</span></div></div>
            <div><div class="bg-active shared"><span>Fim</span></div></div>
            <div><div class="bg-active shared"><span>Fös</span></div></div>
            <div><div class="bg-active shared"><span>Lau</span></div></div>
            <div><div class="bg-active shared"><span>Sun</span></div></div>
          </div>
        </div>
        <div>
          <div>
            <div><svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M24"/></svg></div>
            <div><p>Laugavegur 10</p></div>
          </div>
          <div>
            <a href="/dansgolfid/fyrir-thig/2f1/test-offer"><span>Skoða nánar</span></a>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div>
    <div>
      <div>
        <img src="https://images.ctfassets.net/example/image2.png" alt="Another Place" style="aspect-ratio:16/9;object-fit:cover"/>
      </div>
      <div>
        <h4>Another Place</h4>
        <div><div><p><strong>2f1 on all main courses.</strong></p></div></div>
        <div>
          <div>
            <div><div class="bg-active shared"><span>Mán</span></div></div>
            <div><div class="bg-active shared"><span>Þri</span></div></div>
            <div><div class="bg-active shared"><span>Mið</span></div></div>
            <div><div class="bg-inactive shared"><span>Fim</span></div></div>
            <div><div class="bg-inactive shared"><span>Fös</span></div></div>
            <div><div class="bg-inactive shared"><span>Lau</span></div></div>
            <div><div class="bg-inactive shared"><span>Sun</span></div></div>
          </div>
        </div>
        <div>
          <div>
            <div><svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M24"/></svg></div>
            <div><p>Skólavörðustígur 5</p></div>
          </div>
          <div>
            <a href="/dansgolfid/fyrir-thig/2f1/another-place"><span>Skoða nánar</span></a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`;

function mockFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.pathname.endsWith(".css")) {
    return Promise.resolve(new Response(mockCss, { status: 200 }));
  }
  return Promise.resolve(new Response(mockHtml, { status: 200 }));
}

Deno.test("nova2f1 - fetches and returns offer data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof globalThis.fetch;

  try {
    const req = new Request("http://localhost/x/nova-2f1");
    const res = await nova2f1(req);

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");

    const data = await res.json();
    assertEquals(Array.isArray(data), true);
    assertEquals(data.length, 2);

    assertEquals(data[0].name, "Test Offer");
    assertEquals(
      data[0].image,
      "https://images.ctfassets.net/example/image1.png",
    );
    assertEquals(data[0].address, "Laugavegur 10");
    assertEquals(
      data[0].link,
      "https://www.nova.is/dansgolfid/fyrir-thig/2f1/test-offer",
    );
    assertEquals(data[0].days.length, 7);
    assertEquals(data[0].days[0], "Mán");

    assertEquals(data[1].name, "Another Place");
    assertEquals(data[1].address, "Skólavörðustígur 5");
    assertEquals(data[1].days.length, 3);
    assertEquals(
      data[1].link,
      "https://www.nova.is/dansgolfid/fyrir-thig/2f1/another-place",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("nova2f1 - returns compact JSON by default", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof globalThis.fetch;

  try {
    const req = new Request("http://localhost/x/nova-2f1");
    const res = await nova2f1(req);

    const text = await res.text();
    assertEquals(text.includes("\n"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("nova2f1 - returns pretty JSON when pretty=true", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof globalThis.fetch;

  try {
    const req = new Request("http://localhost/x/nova-2f1?pretty=true");
    const res = await nova2f1(req);

    const text = await res.text();
    assertEquals(text.includes("\n"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("nova2f1 - handles card with missing elements", async () => {
  const minimalHtml = `<!DOCTYPE html><html><body>
<div>
  <div>
    <div>
      <img alt="Bare Offer"/>
      <div>
        <h4>Bare Offer</h4>
        <div>
          <div>
            <a href="/dansgolfid/fyrir-thig/2f1/bare-offer"><span>Skoða nánar</span></a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(minimalHtml, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/nova-2f1");
    const res = await nova2f1(req);
    const data = await res.json();

    assertEquals(data.length, 1);
    assertEquals(data[0].name, "Bare Offer");
    assertEquals(data[0].image, "");
    assertEquals(data[0].address, "");
    assertEquals(data[0].days.length, 0);
    assertEquals(
      data[0].link,
      "https://www.nova.is/dansgolfid/fyrir-thig/2f1/bare-offer",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("nova2f1 - skips link with no card container", async () => {
  const orphanLinkHtml = `<!DOCTYPE html><html><body>
<a href="/dansgolfid/fyrir-thig/2f1/orphan">Orphan</a>
</body></html>`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(orphanLinkHtml, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/nova-2f1");
    const res = await nova2f1(req);
    const data = await res.json();

    assertEquals(data.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("nova2f1 - handles card with non-location SVG only", async () => {
  const noLocationSvgHtml = `<!DOCTYPE html><html><body>
<div>
  <div>
    <div>
      <img src="https://example.com/img.png" alt="SVG Test"/>
      <div>
        <h4>SVG Test</h4>
        <div><div><p>Some description</p></div></div>
        <div>
          <div><div><span>Mán</span></div></div>
        </div>
        <div>
          <div>
            <div><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M15"/></svg></div>
          </div>
          <div>
            <a href="/dansgolfid/fyrir-thig/2f1/svg-test"><span>Skoða nánar</span></a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.resolve(new Response(noLocationSvgHtml, { status: 200 }));
  };

  try {
    const req = new Request("http://localhost/x/nova-2f1");
    const res = await nova2f1(req);
    const data = await res.json();

    assertEquals(data.length, 1);
    assertEquals(data[0].address, "");
    assertEquals(data[0].days, ["Mán"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("nova2f1 - returns all days when CSS fetch fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname.endsWith(".css")) {
      return Promise.reject(new Error("network error"));
    }
    return Promise.resolve(new Response(mockHtml, { status: 200 }));
  }) as typeof globalThis.fetch;

  try {
    const req = new Request("http://localhost/x/nova-2f1");
    const res = await nova2f1(req);
    const data = await res.json();

    // Without CSS info we can't distinguish active/inactive, so all 7 pass
    assertEquals(data[0].days.length, 7);
    assertEquals(data[1].days.length, 7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("nova2f1 - has correct meta information", () => {
  assertEquals(nova2f1.meta?.endpoint, "/x/nova-2f1");
  assertStringIncludes(
    nova2f1.meta?.description || "",
    "2-for-1",
  );
});
