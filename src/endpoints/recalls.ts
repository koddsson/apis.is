import { XMLParser } from "fast-xml-parser";
import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const SOURCE_URL = "https://www.mast.is/is/feed/2";
const TTL_SECONDS = 30 * 60;

const Recall = z.object({
  title: z.string().min(1),
  description: z.string(),
  date: z.iso.datetime(),
  url: z.url(),
  image: z.url().nullable(),
});
type Recall = z.infer<typeof Recall>;

interface FeedItem {
  title?: string;
  description?: string;
  pubDate?: string;
  link?: string;
}

const parser = new XMLParser({
  parseTagValue: false,
  isArray: (name) => name === "item",
});

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function recall(item: FeedItem): Recall {
  const time = Date.parse(item.pubDate ?? "");
  if (!item.title || !item.link || Number.isNaN(time)) {
    throw new Error("Unexpected MAST recalls feed item");
  }
  const description = item.description ?? "";
  return {
    title: item.title.trim(),
    description: text(description),
    date: new Date(time).toISOString(),
    url: item.link,
    image: /<img[^>]*\ssrc="([^"]+)"/.exec(description)?.[1] ?? null,
  };
}

async function fetchRecalls(): Promise<Recall[]> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch MAST recalls: ${res.status}`);
  const feed = parser.parse(await res.text()) as {
    rss?: { channel?: { item?: FeedItem[] } };
  };
  const channel = feed.rss?.channel;
  if (!channel) throw new Error("Unexpected MAST recalls feed format");
  return (channel.item ?? []).map(recall);
}

async function recalls(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const data = await withCache("recalls", TTL_SECONDS, fetchRecalls);
  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

recalls.meta = {
  endpoint: "/x/recalls",
  description:
    "Food recalls and consumption warnings announced by Matvælastofnun (MAST), newest first: title, plain-text description, date, link and image.",
};

recalls.health = { schema: z.array(Recall).min(1) };

export default recalls;
