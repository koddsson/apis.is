import * as z from "zod";
import meetupData from "../data/meetups.json" with { type: "json" };
import { generateRSS } from "../rss.ts";
import { response } from "../utils.ts";

// Submitted times are stored as entered, so seconds are optional.
const Timestamp = z.union([
  z.iso.datetime({ offset: true }),
  z.iso.datetime({ offset: true, precision: -1 }),
]);

export const Meetup = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  url: z.url({ protocol: /^https?$/ }),
  data: z.object({
    start: Timestamp,
    end: Timestamp.nullable(),
  }),
});
export type Meetup = z.infer<typeof Meetup>;

export function upcoming(list: Meetup[], now: number): Meetup[] {
  return list.filter(
    (meetup) => Date.parse(meetup.data.end ?? meetup.data.start) >= now,
  );
}

function meetups(request: Request): Response {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const data =
    url.searchParams.get("upcoming") === "true"
      ? upcoming(meetupData, Date.now())
      : meetupData;

  // Return RSS feed if format=rss
  if (format === "rss") {
    // biome-ignore lint/plugin: RSS is XML, not JSON
    return new Response(generateRSS(data), {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Default JSON response
  return response(data, url.searchParams.get("pretty") === "true");
}

meetups.meta = {
  endpoint: "/x/meetups",
  description:
    "List of Icelandic tech meetups and community groups. ?upcoming=true leaves out meetups that have ended, and ?format=rss returns an RSS feed.",
};

meetups.health = { schema: z.array(Meetup).min(1) };

export default meetups;
