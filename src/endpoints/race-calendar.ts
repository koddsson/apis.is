import { response } from "../utils.ts";
// TODO: Implement caching

/**
 * Pretty bog standard fetching the data from a existing endpoint and returning whatever it gives us.
 */
async function raceCalendar(
  request: Request,
): Promise<Response> {
  const serverResponse = await fetch(
    "https://www.hlaupadagskra.is/_api/cloud-data/v2/items/query?.r=eyJkYXRhQ29sbGVjdGlvbklkIjoiSXRlbXMiLCJxdWVyeSI6eyJmaWx0ZXIiOnsic2hvdyI6eyIkZXEiOiIxIn19LCJzb3J0IjpbeyJmaWVsZE5hbWUiOiJkYWdzZXRuaW5nIiwib3JkZXIiOiJBU0MifV0sInBhZ2luZyI6eyJvZmZzZXQiOjAsImxpbWl0IjoxMDB9LCJmaWVsZHMiOltdfSwicmVmZXJlbmNlZEl0ZW1PcHRpb25zIjpbXSwicmV0dXJuVG90YWxDb3VudCI6dHJ1ZSwiZW52aXJvbm1lbnQiOiJMSVZFIiwiYXBwSWQiOiI5YTM0OGM5Yy0yNTE3LTRlMmEtOWRkYS03ZGJkNDA1OGYwMTAifQ",
    {
      headers: {
        Cookie: "server-session-bind=2a88933c-44c4-4e54-a400-fc1e7444fce1; XSRF-TOKEN=1762804542|PA5PBhJYXDjy; hs=1446915969; svSession=a1daa7a12468a978c01c5464eb4885e4edb70c26663d32cdff69c903a73196d9ab2f9e95379580c3123ed36135b11eb81e60994d53964e647acf431e4f798bcd568a3f5c8eec855bc95fb3ed5e1592b6a2b505858be77d2eab3eea5c9388d7346beea4c8eedcfb2353a9084512333211e6d4adc95067e47e2b8a15c65525daeaab36407bcb9854f4d0e09aa4e6a4d501; wixLanguage=en; client-session-bind=2a88933c-44c4-4e54-a400-fc1e7444fce1",
      },
    }
  );

  if (!serverResponse.ok) {
    const text = await serverResponse.text();
    console.error('Response: ', text)
    throw new Error(`Failed to fetch data: ${serverResponse.status} - ${text}`);
  }
  // TODO: Clean up this data some as it's quite messy
  const json = await serverResponse.json();
  return response(
    json.dataItems,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
}

raceCalendar.meta = {
  endpoint: "/x/race-calendar",
  description: "All Icelandic runs in one place!",
};

export default raceCalendar;
