import * as z from "zod";
import meetupData from "../data/meetups.json" with { type: "json" };
import { generateRSS } from "../rss.ts";
import { response } from "../utils.ts";

// Submitted times are stored as entered, so seconds are optional.
const Timestamp = z.union([
  z.iso.datetime({ offset: true }),
  z.iso.datetime({ offset: true, precision: -1 }),
]);

const Meetup = z.object({
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  data: z.object({
    start: Timestamp,
    end: Timestamp.nullable(),
  }),
});

function meetups(request: Request): Response {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  // Return RSS feed if format=rss
  if (format === "rss") {
    // biome-ignore lint/plugin: RSS is XML, not JSON
    return new Response(generateRSS(meetupData), {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Default JSON response
  return response(meetupData, url.searchParams.get("pretty") === "true");
}

meetups.meta = {
  endpoint: "/x/meetups",
  description:
    "List of Icelandic tech meetups and community groups. Supports RSS feed via ?format=rss query parameter.",
};

meetups.health = { schema: z.array(Meetup).min(1) };

export default meetups;
