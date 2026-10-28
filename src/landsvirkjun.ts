const BASE_URL = "https://www.landsvirkjun.is/rauntimavoktun/";

export type Point = [number, number | null, (number | null)?];

export interface Graph {
  title: string;
  id: string;
  series: Array<{ name: string; uom?: string; data: Point[] }>;
}

export function date(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export async function fetchGraph(
  slug: string,
): Promise<{ url: string; graph: Graph }> {
  const url = BASE_URL + slug;
  const res = await fetch(url, {
    headers: { "User-Agent": "apis.is (+https://apis.is)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${slug}: ${res.status}`);
  const next = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s.exec(
    await res.text(),
  );
  if (!next) throw new Error(`Page data not found on ${slug}`);
  const body: Array<{ __typename: string; primary: { data: string } }> =
    JSON.parse(next[1]).props.pageProps.page.body;
  const slice = body.find((slice) => slice.__typename === "PageBodyGraph");
  if (!slice) throw new Error(`Graph not found on ${slug}`);
  return { url, graph: JSON.parse(slice.primary.data) };
}
