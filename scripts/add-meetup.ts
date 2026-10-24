import { readFileSync, writeFileSync } from "node:fs";
import { addMeetup, parseIssueBody, validateMeetup } from "./meetup.ts";

const DATA_PATH = `${import.meta.dirname}/../src/data/meetups.json`;

const meetup = parseIssueBody(process.env.ISSUE_BODY ?? "");
const problem = validateMeetup(meetup);
if (problem) {
  console.error(`Invalid meetup:\n${problem}`);
  process.exit(1);
}

const meetups = JSON.parse(readFileSync(DATA_PATH, "utf8"));
writeFileSync(
  DATA_PATH,
  `${JSON.stringify(addMeetup(meetups, meetup), null, 2)}\n`,
);
console.log(`Added ${meetup.title}`);
