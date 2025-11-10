import { response } from '../utils.ts';
// TODO: Implement caching

/**
 * Pretty bog standard fetching the data from a existing endpoint and returning whatever it gives us.
 */
async function raceCalendar(
  request,
  params,
): Promise<Response> {
  const serverResponse = await fetch(
    'https://www.hlaupadagskra.is/_api/cloud-data/v2/items/query?.r=eyJkYXRhQ29sbGVjdGlvbklkIjoiSXRlbXMiLCJxdWVyeSI6eyJmaWx0ZXIiOnsic2hvdyI6eyIkZXEiOiIxIn19LCJzb3J0IjpbeyJmaWVsZE5hbWUiOiJkYWdzZXRuaW5nIiwib3JkZXIiOiJBU0MifV0sInBhZ2luZyI6eyJvZmZzZXQiOjAsImxpbWl0IjoxMDB9LCJmaWVsZHMiOltdfSwicmVmZXJlbmNlZEl0ZW1PcHRpb25zIjpbXSwicmV0dXJuVG90YWxDb3VudCI6dHJ1ZSwiZW52aXJvbm1lbnQiOiJMSVZFIiwiYXBwSWQiOiI5YTM0OGM5Yy0yNTE3LTRlMmEtOWRkYS03ZGJkNDA1OGYwMTAifQ',
  );
  // TODO: Clean up this data some as it's quite messy
  const json = await serverResponse.json();
  return response(json.dataItems, new URL(request.url).searchParams.get("pretty") === "true")
}

raceCalendar.meta = {
  endpoint: "/x/race-calendar/",
  description: "All Icelandic runs in one place!"

};

export default raceCalendar;
