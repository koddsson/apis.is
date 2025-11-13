import meetupData from "../data/meetups.json" with { type: "json" };
import { response } from "../utils.ts";
import { generateRSS } from "../rss.ts";

function meetups(
  request: Request,
): Response {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  // Return RSS feed if format=rss
  if (format === "rss") {
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
  description: "List of Icelandic tech meetups and community groups.",
};

export default meetups;
