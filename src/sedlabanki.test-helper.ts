type Series = Record<string, Array<[string, number]>>;

function usDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${month}/${day}/${year} 12:00:00 AM`;
}

export function feed(series: Series): string {
  const body = Object.entries(series)
    .map(([id, entries]) => {
      const data = entries.length
        ? `<TimeSeriesData>${entries
            .map(
              ([date, value]) =>
                `<Entry><Date>${usDate(date)}</Date><Value>${value.toFixed(6)}</Value></Entry>`,
            )
            .join("")}</TimeSeriesData>`
        : "<TimeSeriesData />";
      return `<TimeSeries ID="${id}"><FameName><![CDATA[]]></FameName><Name><![CDATA[Series ${id}]]></Name>${data}</TimeSeries>`;
    })
    .join("");
  return `<?xml version="1.0"  encoding="utf-8"?><Group ID="1"><Name><![CDATA[Group]]></Name>${body}</Group>`;
}

export const NO_DATA =
  "<Error><Type><![CDATA[No data found]]></Type><Description><![CDATA[There was no data found with this GroupID.]]></Description></Error>";

// Mocks fetch to answer each Seðlabanki GroupID with its own body, or a status code.
export function serveGroups(groups: Record<number, string | number>) {
  const originalFetch = globalThis.fetch;
  const urls: URL[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = new URL(input.toString());
    urls.push(url);
    const body = groups[Number(url.searchParams.get("GroupID"))];
    return Promise.resolve(
      typeof body === "number"
        ? new Response("", { status: body })
        : new Response(body, {
            headers: { "Content-Type": "application/xml" },
          }),
    );
  };
  return { urls, restore: () => (globalThis.fetch = originalFetch) };
}
