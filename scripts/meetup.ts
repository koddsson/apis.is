import { Meetup } from "../src/endpoints/meetups.ts";
import { validate } from "../src/health.ts";

const NO_RESPONSE = "_No response_";

// Issue forms render each field as "### Label" followed by its value.
function fields(body: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const section of body.replace(/\r\n/g, "\n").split(/^### /m).slice(1)) {
    const [label, ...value] = section.split("\n");
    const text = value.join("\n").trim();
    result.set(label.trim(), text === NO_RESPONSE ? "" : text);
  }
  return result;
}

export function parseIssueBody(body: string): Meetup {
  const field = fields(body);
  return {
    title: field.get("Meetup Title") ?? "",
    description: field.get("Description") || null,
    url: field.get("Event URL") ?? "",
    data: {
      start: field.get("Start Date and Time") ?? "",
      end: field.get("End Date and Time") || null,
    },
  };
}

export function validateMeetup(meetup: Meetup): string | undefined {
  return validate(Meetup, meetup);
}

export function addMeetup(meetups: Meetup[], meetup: Meetup): Meetup[] {
  return [meetup, ...meetups];
}
