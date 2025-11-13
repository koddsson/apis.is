/**
 * Generate an RSS 2.0 feed from data
 */
export function generateRSS(
  items: Array<{
    title: string;
    description: string | null;
    url: string;
    data: {
      start: string;
      end: string | null;
    };
  }>,
): string {
  const now = new Date().toUTCString();

  const rssItems = items.map((item) => {
    const startDate = new Date(item.data.start);
    const description = item.description || "No description available.";

    return `    <item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(description)}</description>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <pubDate>${startDate.toUTCString()}</pubDate>
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Icelandic Tech Meetups</title>
    <description>List of Icelandic tech meetups and community groups from apis.is</description>
    <link>https://apis.is/x/meetups</link>
    <atom:link href="https://apis.is/x/meetups?format=rss" rel="self" type="application/rss+xml" />
    <lastBuildDate>${now}</lastBuildDate>
    <language>is</language>
${rssItems}
  </channel>
</rss>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
