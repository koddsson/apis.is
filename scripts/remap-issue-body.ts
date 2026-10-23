import { readFileSync, writeFileSync } from "node:fs";
import { remapIssueBody } from "./remap-stack.ts";

const [mapPath, commit, outPath] = process.argv.slice(2);
const body = process.env.ISSUE_BODY ?? "";
const rawMap = JSON.parse(readFileSync(mapPath, "utf8"));

const remapped = remapIssueBody(body, rawMap, commit);
if (remapped === null) {
  console.log("No bundled frames to remap");
} else {
  writeFileSync(outPath, remapped);
  console.log(`Wrote remapped issue body to ${outPath}`);
}
