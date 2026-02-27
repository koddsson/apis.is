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

async function nova2f1(request: Request): Promise<Response> {
  const res = await fetch("https://www.nova.is/dansgolfid/fyrir-thig/2f1");
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) {
    throw new Error("Failed to parse HTML");
  }

  const offers: Offer[] = [];

  const links = doc.querySelectorAll('a[href^="/dansgolfid/fyrir-thig/2f1/"]');
  for (const link of links) {
    const href = link.getAttribute("href") ?? "";

    // Walk up to find the card container that holds both h4 and img
    let card = link.parentElement;
    while (card && !(card.querySelector("h4") && card.querySelector("img"))) {
      card = card.parentElement;
    }
    if (!card) continue;

    const name = card.querySelector("h4")?.textContent?.trim() ?? "";
    const img = card.querySelector("img");
    const image = img?.getAttribute("src") ?? "";

    // Description is in the div following the h4
    const h4 = card.querySelector("h4");
    const descriptionDiv = h4?.parentElement?.querySelector("div");
    const description = descriptionDiv?.textContent?.trim() ?? "";

    // Day availability - spans containing day abbreviations
    const dayNames = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
    const days: string[] = [];
    const spans = card.querySelectorAll("span");
    for (const span of spans) {
      const text = span.textContent?.trim() ?? "";
      if (dayNames.includes(text)) {
        days.push(text);
      }
    }

    // Address - find the p element near the location SVG
    let address = "";
    const svgs = card.querySelectorAll("svg");
    for (const svg of svgs) {
      const viewBox = svg.getAttribute("viewBox") ?? "";
      if (viewBox === "0 0 48 48") {
        // Location icon - address is in a sibling p element
        const container = svg.parentElement?.parentElement;
        const p = container?.querySelector("p");
        if (p) {
          address = p.textContent?.trim() ?? "";
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
