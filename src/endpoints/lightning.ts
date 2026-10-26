import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const SOURCE_URL = "https://brunnur.vedur.is/athuganir/elding/elding.txt";
const TTL_SECONDS = 60;
const MAX_HOURS = 7 * 24;

const Strike = z.object({
  time: z.iso.datetime(),
  latitude: z.number(),
  longitude: z.number(),
  uncertainty: z.number(),
  goodQuality: z.boolean(),
});
type Strike = z.infer<typeof Strike>;

const ROW =
  /^(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2}:\d{2})(?:\.(\d+))?\s+\d+\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\S)$/;

function parseRow(line: string): Strike {
  const match = ROW.exec(line);
  if (!match) throw new Error(`Unexpected lightning row: ${line}`);
  const [, date, time, fraction = "", lat, lon, uncertainty, quality] = match;
  return {
    time: `${date}T${time}.${fraction.padEnd(3, "0").slice(0, 3)}Z`,
    latitude: Number(lat),
    // Longitude is given in degrees west.
    longitude: -Number(lon),
    uncertainty: Number(uncertainty),
    goodQuality: quality === "G",
  };
}

async function fetchStrikes(): Promise<Strike[]> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "apis.is (+https://apis.is)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch lightning: ${res.status}`);
  const text = new TextDecoder("latin1").decode(await res.arrayBuffer());

  const lines = text.split("\n").map((line) => line.trim());
  const header = lines.findIndex((line) => line.startsWith("Dagsetning_Tími"));
  if (header === -1 || !lines[header + 1]?.startsWith("---")) {
    throw new Error("Unexpected lightning file format");
  }

  return lines
    .slice(header + 2)
    .filter((line) => line && !line.startsWith("Engar eldingar"))
    .map(parseRow)
    .sort((a, b) => b.time.localeCompare(a.time));
}

async function lightning(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const hoursParam = url.searchParams.get("hours");
  const hours = hoursParam === null ? MAX_HOURS : Number(hoursParam);
  if (!(hours > 0 && hours <= MAX_HOURS)) {
    return response(
      { error: `hours must be a positive number up to ${MAX_HOURS}` },
      false,
      400,
    );
  }

  const strikes = await withCache("lightning", TTL_SECONDS, fetchStrikes);
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const data = strikes.filter((strike) => strike.time >= since);

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

lightning.meta = {
  endpoint: "/x/lightning",
  description:
    "Lightning strikes detected around Iceland (63-67°N, 13-25°W) over the last week by the UK Met Office's network, via Veðurstofa Íslands, newest first: time, position, location uncertainty (km) and whether the fix is good quality. Often empty, since lightning is rare in Iceland; strikes can also come from eruption plumes. Optional ?hours= (up to 168) to limit to recent strikes.",
};

lightning.health = { schema: z.array(Strike) };

export default lightning;
