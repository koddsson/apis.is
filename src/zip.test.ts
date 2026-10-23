import { assert, test } from "vitest";
import { readZipFiles } from "./zip.ts";
import { GTFS_ZIP, serveZip } from "./zip-fixture.test-helper.ts";

const URL = "https://example.com/gtfs.zip";

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  return "did not throw";
}

test("readZipFiles - reads deflated and stored entries with range requests", async () => {
  const server = serveZip(GTFS_ZIP);
  try {
    const files = await readZipFiles(URL, ["stops.txt", "agency.txt"]);

    assert.include(files["stops.txt"], '10000804,,"Sunnuhlíð"');
    assert.equal(files["agency.txt"], "agency_id,agency_name\n1,Strætó\n");
    assert.equal(server.ranges[0], `bytes=-${22 + 0xffff}`);
    assert.isTrue(server.ranges.every((range) => range.startsWith("bytes=")));
  } finally {
    server.restore();
  }
});

test("readZipFiles - reports missing and unsupported entries", async () => {
  const server = serveZip(GTFS_ZIP);
  try {
    assert.equal(
      await rejection(readZipFiles(URL, ["missing.txt"])),
      `missing.txt not found in ${URL}`,
    );
    assert.equal(
      await rejection(readZipFiles(URL, ["legacy.txt"])),
      "Unsupported zip compression method 12",
    );
  } finally {
    server.restore();
  }
});

test("readZipFiles - rejects servers without range support and non-zips", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = () => Promise.resolve(new Response(GTFS_ZIP));
    assert.equal(
      await rejection(readZipFiles(URL, ["stops.txt"])),
      `Range request to ${URL} failed: 200`,
    );

    const notZip = serveZip(new TextEncoder().encode("x".repeat(100)));
    assert.equal(
      await rejection(readZipFiles(URL, ["stops.txt"])),
      "Not a zip file: end of central directory not found",
    );
    notZip.restore();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
