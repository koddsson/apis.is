import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";
import { response } from "../utils.ts";

interface Offer {
  name: string;
  description: string;
  image: string;
  address: string;
  days: string[];
  link: string;
}

const DAY_NAMES = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];

// The Nova site renders all 7 day labels for every offer but uses different
// CSS background-color classes on each day's parent div to distinguish
// available (brand pink) from unavailable (grey) days.  Because the class
// names are obfuscated and change between builds, we detect the "inactive"
// class dynamically: scan every day-indicator span across the whole page,
// collect the CSS classes that vary between parent divs, and treat the
// minority variant(s) as "inactive".
function findInactiveDayClasses(
  doc: ReturnType<InstanceType<typeof DOMParser>["parseFromString"]>,
): Set<string> {
  const classCounts = new Map<string, number>();
  let total = 0;

  for (const span of doc!.querySelectorAll("span")) {
    if (!DAY_NAMES.includes(span.textContent!.trim())) continue;
    const parent = span.parentElement;
    if (!parent) continue;
    total++;
    for (
      const cls of (parent.getAttribute("class") || "").split(/\s+/).filter(
        Boolean,
      )
    ) {
      classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
    }
  }

  if (total === 0) return new Set();

  // Variant classes appear on some but not all day parent elements
  const variants: [string, number][] = [];
  for (const [cls, count] of classCounts) {
    if (count < total) variants.push([cls, count]);
  }

  // Need at least two variants (active + inactive) to distinguish
  if (variants.length < 2) return new Set();

  // The most-frequent variant is the "active" style; all others are inactive
  variants.sort((a, b) => b[1] - a[1]);
  return new Set(variants.slice(1).map(([cls]) => cls));
}

async function nova2f1(request: Request): Promise<Response> {
  const res = await fetch("https://www.nova.is/dansgolfid/fyrir-thig/2f1");
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html")!;
  const inactiveDayClasses = findInactiveDayClasses(doc);
  const offers: Offer[] = [];

  const links = doc.querySelectorAll('a[href^="/dansgolfid/fyrir-thig/2f1/"]');
  for (const link of links) {
    const href = link.getAttribute("href")!;

    // Walk up to find the card container that holds both h4 and img
    let card = link.parentElement;
    while (card && !(card.querySelector("h4") && card.querySelector("img"))) {
      card = card.parentElement;
    }
    if (!card) continue;

    const name = card.querySelector("h4")!.textContent!.trim();
    const image = card.querySelector("img")!.getAttribute("src") || "";

    // Description is in the div following the h4
    const h4 = card.querySelector("h4")!;
    const descriptionDiv = h4.parentElement?.querySelector("div");
    const description = descriptionDiv?.textContent?.trim() || "";

    // Day availability - only include active (non-greyed-out) days
    const days: string[] = [];
    const spans = card.querySelectorAll("span");
    for (const span of spans) {
      const text = span.textContent!.trim();
      if (DAY_NAMES.includes(text)) {
        const parentClasses = (span.parentElement?.getAttribute("class") || "")
          .split(/\s+/);
        const isInactive = parentClasses.some((cls) =>
          inactiveDayClasses.has(cls)
        );
        if (!isInactive) {
          days.push(text);
        }
      }
    }

    // Address - find the p element near the location SVG
    let address = "";
    const svgs = card.querySelectorAll("svg");
    for (const svg of svgs) {
      if (svg.getAttribute("viewBox") === "0 0 48 48") {
        // Location icon - address is in a sibling p element
        const p = svg.parentElement?.parentElement?.querySelector("p");
        if (p) {
          address = p.textContent!.trim();
        }
        break;
      }
    }

    offers.push({
      name,
      description,
      image,
      address,
      days,
      link: `https://www.nova.is${href}`,
    });
  }

  return response(
    offers,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
}

nova2f1.meta = {
  endpoint: "/x/nova-2f1",
  description: "2-for-1 offers from Nova's FyrirÞig program.",
};

export default nova2f1;
