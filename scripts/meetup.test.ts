import { assert, test } from "vitest";
import { addMeetup, parseIssueBody, validateMeetup } from "./meetup.ts";

const BODY = `### Meetup Title

Reykjavík Web Developers

### Description

Talks about the web.
Second line.

### Event URL

https://example.com/event

### Start Date and Time

2026-11-13T20:00:00Z

### End Date and Time

_No response_`;

test("parseIssueBody - reads each issue form field", () => {
  assert.deepEqual(parseIssueBody(BODY), {
    title: "Reykjavík Web Developers",
    description: "Talks about the web.\nSecond line.",
    url: "https://example.com/event",
    data: { start: "2026-11-13T20:00:00Z", end: null },
  });
});

test("parseIssueBody - handles CRLF and an empty description", () => {
  const body = BODY.replace(
    "Talks about the web.\nSecond line.",
    "_No response_",
  ).replace(/\n/g, "\r\n");
  const meetup = parseIssueBody(body);
  assert.isNull(meetup.description);
  assert.equal(meetup.title, "Reykjavík Web Developers");
});

test("parseIssueBody - leaves missing fields empty", () => {
  assert.deepEqual(parseIssueBody(""), {
    title: "",
    description: null,
    url: "",
    data: { start: "", end: null },
  });
});

test("validateMeetup - accepts a complete meetup", () => {
  assert.isUndefined(validateMeetup(parseIssueBody(BODY)));
});

test("validateMeetup - reports each invalid field", () => {
  const problem = validateMeetup({
    title: "",
    description: null,
    url: "ftp://example.com",
    data: { start: "2026-11-13 20:00", end: null },
  });
  assert.include(problem ?? "", "title");
  assert.include(problem ?? "", "url");
  assert.include(problem ?? "", "data.start");
});

test("addMeetup - puts the new meetup first", () => {
  const first = parseIssueBody(BODY);
  const second = { ...first, title: "Second" };
  assert.deepEqual(
    addMeetup([first], second).map((m) => m.title),
    ["Second", "Reykjavík Web Developers"],
  );
});
