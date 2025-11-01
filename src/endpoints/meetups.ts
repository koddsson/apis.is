import meetupData from "../data/meetups.json" with { type: "json" };
import { response } from "../utils.ts";

export default async function(
  request,
  params,
): Promise<Response> {
  const url = new URL(request.url);
  return response(meetupData, url.searchParams.get("pretty") === "true")
}
