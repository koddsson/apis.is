import { assert, test } from "vitest";
import { generateRSS } from "./rss.ts";

test("generateRSS - generates valid RSS 2.0 feed", () => {
  const items = [
    {
      title: "Test Meetup",
      description: "A test meetup description",
      url: "https://example.com/meetup",
      data: {
        start: "2024-12-01T18:00:00Z",
        end: "2024-12-01T20:00:00Z",
      },
    },
  ];

  const rss = generateRSS(items);

  assert.include(rss, '<?xml version="1.0" encoding="UTF-8"?>');
  assert.include(rss, '<rss version="2.0"');
  assert.include(rss, "<channel>");
  assert.include(rss, "</channel>");
  assert.include(rss, "</rss>");
});

test("generateRSS - includes channel metadata", () => {
  const items = [
    {
      title: "Test Meetup",
      description: "Test description",
      url: "https://example.com/meetup",
      data: {
        start: "2024-12-01T18:00:00Z",
        end: null,
      },
    },
  ];

  const rss = generateRSS(items);

  assert.include(rss, "<title>Icelandic Tech Meetups</title>");
  assert.include(
    rss,
    "<description>List of Icelandic tech meetups and community groups from apis.is</description>",
  );
  assert.include(rss, "<link>https://apis.is/x/meetups</link>");
  assert.include(rss, "<language>is</language>");
  assert.include(rss, "<lastBuildDate>");
});

test("generateRSS - includes item data", () => {
  const items = [
    {
      title: "JavaScript Meetup",
      description: "Monthly JS meetup",
      url: "https://example.com/js-meetup",
      data: {
        start: "2024-12-01T18:00:00Z",
        end: "2024-12-01T20:00:00Z",
      },
    },
  ];

  const rss = generateRSS(items);

  assert.include(rss, "<item>");
  assert.include(rss, "<title>JavaScript Meetup</title>");
  assert.include(rss, "<description>Monthly JS meetup</description>");
  assert.include(rss, "<link>https://example.com/js-meetup</link>");
  assert.include(
    rss,
    '<guid isPermaLink="true">https://example.com/js-meetup</guid>',
  );
  assert.include(rss, "<pubDate>");
  assert.include(rss, "</item>");
});

test("generateRSS - handles null description", () => {
  const items = [
    {
      title: "Test Meetup",
      description: null,
      url: "https://example.com/meetup",
      data: {
        start: "2024-12-01T18:00:00Z",
        end: null,
      },
    },
  ];

  const rss = generateRSS(items);

  assert.include(rss, "<description>No description available.</description>");
});

test("generateRSS - escapes XML special characters", () => {
  const items = [
    {
      title: 'Test & "Special" <Characters>',
      description: "Description with & < > \" ' characters",
      url: "https://example.com/test?param=value&other=test",
      data: {
        start: "2024-12-01T18:00:00Z",
        end: null,
      },
    },
  ];

  const rss = generateRSS(items);

  assert.include(rss, "&amp;");
  assert.include(rss, "&lt;");
  assert.include(rss, "&gt;");
  assert.include(rss, "&quot;");
  assert.include(rss, "&apos;");

  // Should not contain unescaped special characters
  assert.deepEqual(rss.includes('Test & "Special" <Characters>'), false);
});

test("generateRSS - handles multiple items", () => {
  const items = [
    {
      title: "Meetup 1",
      description: "First meetup",
      url: "https://example.com/meetup1",
      data: {
        start: "2024-12-01T18:00:00Z",
        end: null,
      },
    },
    {
      title: "Meetup 2",
      description: "Second meetup",
      url: "https://example.com/meetup2",
      data: {
        start: "2024-12-02T18:00:00Z",
        end: null,
      },
    },
    {
      title: "Meetup 3",
      description: "Third meetup",
      url: "https://example.com/meetup3",
      data: {
        start: "2024-12-03T18:00:00Z",
        end: null,
      },
    },
  ];

  const rss = generateRSS(items);

  assert.include(rss, "<title>Meetup 1</title>");
  assert.include(rss, "<title>Meetup 2</title>");
  assert.include(rss, "<title>Meetup 3</title>");
  assert.include(rss, "First meetup");
  assert.include(rss, "Second meetup");
  assert.include(rss, "Third meetup");
});

test("generateRSS - handles empty items array", () => {
  const items: Array<{
    title: string;
    description: string | null;
    url: string;
    data: { start: string; end: string | null };
  }> = [];

  const rss = generateRSS(items);

  assert.include(rss, "<channel>");
  assert.include(rss, "</channel>");
  // Should not contain any item tags
  assert.deepEqual(rss.includes("<item>"), false);
});
