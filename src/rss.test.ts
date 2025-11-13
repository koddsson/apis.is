import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateRSS } from "./rss.ts";

Deno.test("generateRSS - generates valid RSS 2.0 feed", () => {
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

  assertStringIncludes(rss, '<?xml version="1.0" encoding="UTF-8"?>');
  assertStringIncludes(rss, '<rss version="2.0"');
  assertStringIncludes(rss, "<channel>");
  assertStringIncludes(rss, "</channel>");
  assertStringIncludes(rss, "</rss>");
});

Deno.test("generateRSS - includes channel metadata", () => {
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

  assertStringIncludes(rss, "<title>Icelandic Tech Meetups</title>");
  assertStringIncludes(
    rss,
    "<description>List of Icelandic tech meetups and community groups from apis.is</description>",
  );
  assertStringIncludes(rss, "<link>https://apis.is/x/meetups</link>");
  assertStringIncludes(rss, "<language>is</language>");
  assertStringIncludes(rss, "<lastBuildDate>");
});

Deno.test("generateRSS - includes item data", () => {
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

  assertStringIncludes(rss, "<item>");
  assertStringIncludes(rss, "<title>JavaScript Meetup</title>");
  assertStringIncludes(rss, "<description>Monthly JS meetup</description>");
  assertStringIncludes(rss, "<link>https://example.com/js-meetup</link>");
  assertStringIncludes(
    rss,
    '<guid isPermaLink="true">https://example.com/js-meetup</guid>',
  );
  assertStringIncludes(rss, "<pubDate>");
  assertStringIncludes(rss, "</item>");
});

Deno.test("generateRSS - handles null description", () => {
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

  assertStringIncludes(
    rss,
    "<description>No description available.</description>",
  );
});

Deno.test("generateRSS - escapes XML special characters", () => {
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

  assertStringIncludes(rss, "&amp;");
  assertStringIncludes(rss, "&lt;");
  assertStringIncludes(rss, "&gt;");
  assertStringIncludes(rss, "&quot;");
  assertStringIncludes(rss, "&apos;");

  // Should not contain unescaped special characters
  assertEquals(rss.includes('Test & "Special" <Characters>'), false);
});

Deno.test("generateRSS - handles multiple items", () => {
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

  assertStringIncludes(rss, "<title>Meetup 1</title>");
  assertStringIncludes(rss, "<title>Meetup 2</title>");
  assertStringIncludes(rss, "<title>Meetup 3</title>");
  assertStringIncludes(rss, "First meetup");
  assertStringIncludes(rss, "Second meetup");
  assertStringIncludes(rss, "Third meetup");
});

Deno.test("generateRSS - handles empty items array", () => {
  const items: Array<{
    title: string;
    description: string | null;
    url: string;
    data: { start: string; end: string | null };
  }> = [];

  const rss = generateRSS(items);

  assertStringIncludes(rss, "<channel>");
  assertStringIncludes(rss, "</channel>");
  // Should not contain any item tags
  assertEquals(rss.includes("<item>"), false);
});
