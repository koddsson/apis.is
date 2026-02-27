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
const BASE_URL = "https://www.nova.is";

// Returns true when a hex colour is grey-ish (R ≈ G ≈ B).
function isGreyColor(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return Math.max(r, g, b) - Math.min(r, g, b) < 30;
}

// The Nova site renders all 7 day labels for every offer but uses different
// CSS background-color classes on each day's parent div to distinguish
// available (brand pink) from unavailable (grey) days.  Because the class
// names are obfuscated and change between builds we:
//   1. Find which CSS classes vary between day-indicator parent divs.
//   2. Fetch the site's stylesheets and look up each variant's
//      background-color.
//   3. Mark any variant whose colour is grey as "inactive".
// If stylesheets can't be fetched the set is empty and all days pass through.
async function findInactiveDayClasses(
  doc: ReturnType<InstanceType<typeof DOMParser>["parseFromString"]>,
): Promise<Set<string>> {
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
  const variantClasses = new Set<string>();
  for (const [cls, count] of classCounts) {
    if (count < total) variantClasses.add(cls);
  }

  // Need at least two variants (active + inactive) to distinguish
  if (variantClasses.size < 2) return new Set();

  // Fetch CSS stylesheets to determine which variant is "inactive"
  const inactiveClasses = new Set<string>();

  for (const link of doc!.querySelectorAll('link[rel="stylesheet"]')) {
    const href = link.getAttribute("href");
    if (!href) continue;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    try {
      const cssRes = await fetch(url);
      const css = await cssRes.text();

      for (const cls of variantClasses) {
        const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(
          `\\.${escaped}\\s*\\{[^}]*background-color:\\s*(#[0-9a-fA-F]{6})`,
        );
        const match = regex.exec(css);
        if (match && isGreyColor(match[1])) {
          inactiveClasses.add(cls);
        }
      }

      if (inactiveClasses.size > 0) break; // Found what we need
    } catch {
      continue; // Try next stylesheet
    }
  }

  return inactiveClasses;
}

async function nova2f1(request: Request): Promise<Response> {
  const res = await fetch("https://www.nova.is/dansgolfid/fyrir-thig/2f1");
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html")!;
  const inactiveDayClasses = await findInactiveDayClasses(doc);
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
