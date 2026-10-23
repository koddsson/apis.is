import { assert, test } from "vitest";
import { parseCsv } from "./csv.ts";

test("parseCsv - maps rows to the header and handles quoting", () => {
  assert.deepEqual(
    parseCsv(
      '﻿id,name,note\r\n1,"Hlemmur, ""C""",\r\n2,Plain\n\n3,"multi\nline",x',
    ),
    [
      { id: "1", name: 'Hlemmur, "C"', note: "" },
      { id: "2", name: "Plain", note: "" },
      { id: "3", name: "multi\nline", note: "x" },
    ],
  );
});

test("parseCsv - returns no rows for empty input", () => {
  assert.deepEqual(parseCsv(""), []);
  assert.deepEqual(parseCsv("id,name\n"), []);
});
