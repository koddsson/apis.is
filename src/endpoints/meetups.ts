import meetupData from "../data/meetups.json" with { type: "json" };
import { response } from "../utils.ts";

function meetups(
  request: Request,
): Response {
  const url = new URL(request.url);
  return response(meetupData, url.searchParams.get("pretty") === "true")
}

meetups.meta = {
  endpoint: "/x/meetups",
  description: "List of Icelandic tech meetups and community groups.",
};

export default meetups;
