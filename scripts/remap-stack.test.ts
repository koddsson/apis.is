import { SourceMapGenerator } from "source-map-js";
import { assert, test } from "vitest";
import { remapIssueBody, remapStack, repoRelativePath } from "./remap-stack.ts";

const CHECKOUT = "../../../home/runner/work/apis.is/apis.is";

function sourceMap() {
  const generator = new SourceMapGenerator({ file: "index.js" });
  generator.addMapping({
    generated: { line: 16319, column: 15 },
    original: { line: 26, column: 15 },
    source: `${CHECKOUT}/src/endpoints/race-calendar.ts`,
  });
  generator.addMapping({
    generated: { line: 1687, column: 21 },
    original: { line: 46, column: 27 },
    source: `${CHECKOUT}/src/router.ts`,
  });
  return JSON.parse(generator.toString());
}

const BUNDLED = `SyntaxError: Unexpected token '<'
    at async Object.raceCalendar [as handler] (index.js:16319:16)
    at async handler4 (index.js:1687:22)
    at async next (index.js:99:1)`;

test("repoRelativePath - trims the checkout path", () => {
  assert.equal(
    repoRelativePath(`${CHECKOUT}/src/endpoints/gengi.ts`),
    "src/endpoints/gengi.ts",
  );
  assert.equal(
    repoRelativePath(`${CHECKOUT}/node_modules/linkedom/src/dom.js`),
    "node_modules/linkedom/src/dom.js",
  );
  assert.equal(repoRelativePath("../../worker.ts"), "worker.ts");
});

test("remapStack - rewrites mapped frames and keeps the rest", () => {
  assert.equal(
    remapStack(BUNDLED, sourceMap()),
    `SyntaxError: Unexpected token '<'
    at async Object.raceCalendar [as handler] (src/endpoints/race-calendar.ts:26:16)
    at async handler4 (src/router.ts:46:28)
    at async next (index.js:99:1)`,
  );
});

test("remapIssueBody - replaces the stack trace and keeps the bundled one", () => {
  const body = `An uncaught error occurred in production.

**Stack Trace:**
\`\`\`
${BUNDLED}
\`\`\`

**Fingerprint:** \`error-1\``;

  const remapped = remapIssueBody(
    body,
    sourceMap(),
    "0123456789abcdef0123456789abcdef01234567",
  );

  assert.isNotNull(remapped);
  assert.include(remapped, "**Stack Trace** (source-mapped to `0123456`):");
  assert.include(remapped, "(src/endpoints/race-calendar.ts:26:16)");
  assert.include(
    remapped,
    `<summary>Bundled stack trace</summary>\n\n\`\`\`\n${BUNDLED}\n\`\`\``,
  );
  assert.include(remapped, "**Fingerprint:** `error-1`");
});

test("remapIssueBody - returns null when there is nothing to remap", () => {
  const map = sourceMap();
  assert.isNull(remapIssueBody("No stack here", map, "abc"));
  assert.isNull(
    remapIssueBody(
      "**Stack Trace:**\n```\nNo stack trace available\n```",
      map,
      "abc",
    ),
  );
});
