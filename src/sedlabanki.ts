import { XMLParser } from "fast-xml-parser";

const FEED_URL = "https://sedlabanki.is/xmltimeseries/Default.aspx";

export interface Entry {
  date: string;
  value: number;
}

interface Feed {
  Group?: {
    TimeSeries: Array<{
      "@_ID": string;
      TimeSeriesData: { Entry?: Array<{ Date: string; Value: string }> };
    }>;
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  isArray: (name) => name === "TimeSeries" || name === "Entry",
});

// The feed formats dates as "10/1/2026 12:00:00 AM".
export function isoDate(value: string): string {
  const [month, day, year] = value.split(" ")[0].split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function fetchGroup(
  group: number,
  days: number,
): Promise<Map<string, Entry[]>> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const params = new URLSearchParams({
    GroupID: String(group),
    DagsFra: day(from),
    DagsTil: day(to),
    Type: "xml",
  });
  const res = await fetch(`${FEED_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch from Seðlabanki: ${res.status}`);
  }
  const feed = parser.parse(await res.text()) as Feed;
  if (!feed.Group) throw new Error(`No data from Seðlabanki group ${group}`);

  return new Map(
    feed.Group.TimeSeries.map((series) => [
      series["@_ID"],
      (series.TimeSeriesData.Entry ?? []).map((entry) => ({
        date: isoDate(entry.Date),
        value: Number(entry.Value),
      })),
    ]),
  );
}

export function series(
  groups: Map<string, Entry[]>,
  id: string,
): [Entry, ...Entry[]] {
  const entries = groups.get(id);
  if (!entries?.length) throw new Error(`No data for Seðlabanki series ${id}`);
  return entries as [Entry, ...Entry[]];
}
